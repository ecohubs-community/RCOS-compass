import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lint, type LintInput } from '../../src/lib/server/linter/index.js';
import { allFindings, LINT_SHAPE } from '../../src/lib/shared/linter.js';

/**
 * The rule set. docs/11-definition-linter.md §8.
 *
 * Table-driven, one fixture per rule, drawn from the guide's own good and
 * anti-pattern examples — and now per *line*, because that is the unit the guide
 * judges: "what breaks if we delete this line?" A body mixing a rule and a value
 * is ordinary, and the cases that matter most are the ones a single whole-body
 * type could never express.
 *
 * The whole set runs with no AI provider: everything here is text and word
 * lists, and the two `ai-assist` rules are a separate pass that degrades to
 * silence rather than to a guess.
 */
const linterDir = join(import.meta.dirname, '../../src/lib/server/linter');

/** A body good enough that only the line under test should say anything. */
const clean = {
	plainLanguage: 'In practice: the assembly confirms you, or you stay a candidate.',
	locale: 'en'
};

const of = (body: string, extra: Partial<LintInput> = {}) => lint({ ...clean, body, ...extra });
/** The rules fired against one line, by its index. */
const rulesOnLine = (body: string, line: number, extra: Partial<LintInput> = {}) =>
	of(body, extra).lines[line]!.findings.map((finding) => finding.rule);
const jobs = (body: string, extra: Partial<LintInput> = {}) =>
	of(body, extra).lines.map((line) => line.job);

describe('a line is the unit', () => {
	it('judges each line of a mixed body against its own job', () => {
		// The case a whole-body type cannot express, and the reason for the change:
		// a rule and a value in one definition, each checked as what it is.
		const result = of(
			'Candidates become full members by a consent decision of the assembly, otherwise they remain candidates. We are a community of growers and makers.'
		);

		expect(result.lines.map((line) => line.job)).toEqual(['enforceable', 'expressive']);
		// The enforceable line got the enforceable checks, and the expressive line
		// did not — which is what "unchecked" used to mean for one of the two.
		expect(result.lines[0]!.findings.map((f) => f.rule)).toContain('enf.subject');
		expect(result.lines[1]!.findings.map((f) => f.rule)).not.toContain('enf.subject');
	});

	it('reports every job as the linter’s reading, never as somebody’s claim', () => {
		// Nobody declares a job in this change. The field exists so author-set
		// labels can land later without a second stored shape.
		const result = of('Members must leave in writing to the assembly, otherwise nothing changes.');
		expect(result.lines.every((line) => line.source === 'inferred')).toBe(true);
	});

	it('assigns no job to a line it cannot place, rather than a default', () => {
		expect(jobs('The following provisions apply.')).toEqual([null]);
	});

	it('carries no lines for an empty body, and is not an error', () => {
		const result = of('');
		expect(result.lines).toEqual([]);
		expect(result.primaryJob).toBeNull();
	});
});

describe('enforceable', () => {
	const rule =
		'Candidates who complete their hours become full members by a consent decision of the assembly, otherwise they remain candidates.';

	it('places a rule stated in the indicative, not only one that says must', () => {
		// Governance prose binds without "shall" at least as often as with it.
		// Requiring the modal left real rules unlabelled and unchecked.
		expect(jobs(rule)).toEqual(['enforceable']);
	});

	it('says what passed', () => {
		expect(rulesOnLine(rule, 0)).toEqual(
			expect.arrayContaining(['enf.subject', 'enf.process', 'enf.recorded'])
		);
	});

	it('asks for a consequence when nothing turns on it', () => {
		expect(
			rulesOnLine('Members must tell the assembly in writing before the meeting.', 0)
		).toContain('enf.consequence');
	});
});

describe('interpretive', () => {
	it('places a trade-off with a default', () => {
		expect(
			jobs('We weigh transparency over speed by default, unless a decision is urgent.')
		).toEqual(['interpretive']);
	});

	it('asks whether a decision can override it', () => {
		expect(
			rulesOnLine('We weigh transparency over speed by default, unless a decision is urgent.', 0)
		).toContain('int.overridable');
	});

	it('objects to an absolute inside a principle', () => {
		expect(
			rulesOnLine(
				'We weigh openness over speed by default, and members must never withhold a document.',
				0
			)
		).toContain('int.absolute');
	});
});

describe('expressive', () => {
	it('places a line carrying a non-binding marker', () => {
		expect(jobs('This is an aspiration: we welcome newcomers warmly.')).toEqual(['expressive']);
	});

	it('places a line about who the community is', () => {
		expect(jobs('We are a community of growers and makers.')).toEqual(['expressive']);
	});

	it('objects to obligation words under a non-binding label', () => {
		expect(rulesOnLine('As an aspiration, members must show up with humility.', 0)).toContain(
			'exp.obligation'
		);
	});
});

describe('the ambiguous middle', () => {
	const line = 'Candidates are expected to show up with humility and a willingness to learn.';

	it('fires on a line that sounds binding and carries no test', () => {
		// The guide's dangerous case, and the one a whole-body type made
		// unreachable: it is about an *unlabelled* line.
		expect(rulesOnLine(line, 0)).toContain('line.ambiguous-middle');
	});

	it('offers all three ways out and prefers none', () => {
		const finding = of(line).lines[0]!.findings.find((f) => f.rule === 'line.ambiguous-middle')!;
		expect(finding.remedies).toEqual(['make_enforceable', 'label_non_binding', 'delete_line']);
	});

	it('stays quiet once the same sentiment is marked non-binding', () => {
		expect(
			rulesOnLine('As an aspiration, candidates are expected to show up with humility.', 0)
		).not.toContain('line.ambiguous-middle');
	});

	it('stays quiet on a binding line that carries a test', () => {
		expect(
			rulesOnLine(
				'Members must tell the assembly in writing, otherwise the departure is not recorded.',
				0
			)
		).not.toContain('line.ambiguous-middle');
	});

	it('stays quiet on a line that binds nobody', () => {
		expect(rulesOnLine('We are a community of growers and makers.', 0)).not.toContain(
			'line.ambiguous-middle'
		);
	});

	it('never stops a freeze', () => {
		// Blocker-*shaped*, which is a shape and not a gate: `freeze` never asks.
		expect(of(line).clean).toBe(false);
	});
});

describe('clutter', () => {
	it('fires on a line nothing turns on', () => {
		expect(rulesOnLine('The following provisions apply.', 0)).toContain('line.clutter');
	});

	it('names what a line duplicates', () => {
		const result = of('Land and buildings are held in common by the whole circle.', {
			adoptedElsewhere: [
				{
					key: 'commons',
					title: 'What we hold in common',
					body: 'Land and buildings are held in common by the whole circle.'
				}
			]
		});
		const finding = allFindings(result).find((f) => f.rule === 'line.clutter')!;
		expect(finding.message).toContain('What we hold in common');
	});

	it('stays quiet on a line about who the community is', () => {
		// The quietest rule of the four, and the only one that tells a community to
		// delete its own words. An identity line changes who a community attracts,
		// so deleting it changes something.
		expect(rulesOnLine('We are a community of growers and makers.', 0)).not.toContain(
			'line.clutter'
		);
	});

	it('stays quiet on a rule', () => {
		expect(
			rulesOnLine(
				'Members must tell the assembly in writing, otherwise the departure is not recorded.',
				0
			)
		).not.toContain('line.clutter');
	});

	it('never fires on the ambiguous middle', () => {
		// That line's problem is that it may bind. Telling somebody to delete a
		// possible rule is the wrong advice, so only one of the two speaks.
		const fired = rulesOnLine(
			'Candidates are expected to show up with humility and a willingness to learn.',
			0
		);
		expect(fired).toContain('line.ambiguous-middle');
		expect(fired).not.toContain('line.clutter');
	});

	it('is advice, never blocker-shaped', () => {
		const finding = of('The following provisions apply.').lines[0]!.findings.find(
			(f) => f.rule === 'line.clutter'
		)!;
		expect(finding.severity).toBe('note');
	});
});

describe('the primary job', () => {
	it('is the strongest present, not the commonest', () => {
		// Four values and one rule is, to anyone bound by it, an enforceable
		// definition. A majority rule would label it expressive — which is the
		// guide's own "don't demote an enforced rule into a value", by arithmetic.
		const body = [
			'We are a community of growers.',
			'We are a community of makers.',
			'We are a community of cooks.',
			'Members must tell the assembly in writing, otherwise the departure is not recorded.'
		].join(' ');
		expect(of(body).primaryJob).toBe('enforceable');
	});

	it('falls to interpretive when no line is enforceable', () => {
		const body =
			'We weigh transparency over speed by default, unless urgent. We are a community of growers.';
		expect(of(body).primaryJob).toBe('interpretive');
	});

	it('is none where no line carries a job', () => {
		expect(of('The following provisions apply.').primaryJob).toBeNull();
	});

	it('ignores a type a caller supplies', () => {
		// There is nowhere to supply one: `LintInput` has no `type`. Asserted so
		// that re-adding it is a deliberate act rather than a quiet regression.
		expect('type' in ({} as LintInput)).toBe(false);
		const supplied = { ...clean, body: 'We are a community of growers.', type: 'enforceable' };
		expect(lint(supplied as LintInput).primaryJob).toBe('expressive');
	});
});

describe('the whole body', () => {
	it('asks for a plain-language mirror, once, not per line', () => {
		const result = of('Members must leave in writing, otherwise nothing is recorded.', {
			plainLanguage: null
		});
		expect(result.bodyFindings.map((f) => f.rule)).toContain('all.plain');
		expect(result.lines.flatMap((l) => l.findings).map((f) => f.rule)).not.toContain('all.plain');
	});

	it('says a vagueness list is missing rather than letting the text look checked', () => {
		const result = of('Members meet regularly.', { locale: 'zz' });
		expect(result.bodyFindings.map((f) => f.rule)).toContain('all.vague.unavailable');
	});
});

describe('the rule set is told what surface it is judging', () => {
	it('asks a definition for its plain-language mirror', () => {
		// The field exists and is empty. That is the finding.
		const result = lint({ body: 'Members must give notice.', plainLanguage: null, locale: 'en' });
		expect(result.bodyFindings.map((f) => f.rule)).toContain('all.plain');
	});

	it('never asks a proposal for one, because a proposal has no such field', () => {
		// `undefined`, not `null`: the discussion rail linted every proposal with
		// no plain-language input and every proposal was told, forever, to add
		// something it had nowhere to put.
		const result = lint({ body: 'Members must give notice.', locale: 'en' });
		expect(result.bodyFindings.map((f) => f.rule)).not.toContain('all.plain');
	});
});

describe('clutter leaves real writing alone', () => {
	it('says nothing about a rule addressed to one office-holder', () => {
		// Subject and a named process, with no "must" — the shape half of real
		// governance prose uses. It used to infer no job and fall through to
		// "delete the line".
		expect(
			rulesOnLine('A member may leave at any time by telling a steward in writing.', 0)
		).not.toContain('line.clutter');
	});

	it('says nothing about the consequence half of a rule', () => {
		// The unit is the sentence, so a rule and its consequence arrive as two
		// lines and the second carries no subject of its own.
		expect(rulesOnLine('If they do not, the departure is not recorded.', 0)).not.toContain(
			'line.clutter'
		);
	});

	it('reads a purpose statement as expressive rather than as clutter', () => {
		const result = of('EcoHubs exists to reduce dependency on extractive systems.');
		expect(result.lines[0]!.job).toBe('expressive');
		expect(result.lines[0]!.findings.map((f) => f.rule)).not.toContain('line.clutter');
	});
});

describe('the linter is advice', () => {
	it('reports cleanliness without ever refusing anything', () => {
		// A definition — so it has a plain-language field, and leaving it empty is
		// worth saying. A proposal passes no `plainLanguage` at all and is not
		// told to fill in a box it does not have.
		const messy = lint({ body: 'Stuff happens.', plainLanguage: null, locale: 'en' });
		expect(messy.clean).toBe(false);
		// It returns a verdict. It has no way to stop a freeze, because `freeze`
		// never asks it — a community may adopt a definition the linter dislikes,
		// and the disagreement is stored with the version.
		expect(messy.shape).toBe(LINT_SHAPE);
	});

	it('stamps its shape, so a later reader knows what it is looking at', () => {
		// A result written before per-line linting describes a body, not lines.
		// Without the stamp a screen built for this shape would render it as an
		// empty annotation — which reads as "this definition is clean".
		expect(of('Members must leave in writing.').shape).toBe(LINT_SHAPE);
	});

	it('cannot reach an AI provider even if one were configured', () => {
		// Asserted structurally rather than by an environment variable: every rule
		// here is text and word lists, and the two ai-assist rules are a separate
		// pass that degrades to silence, never to a guess.
		const source = readdirSync(linterDir)
			.filter((file) => file.endsWith('.ts'))
			.map((file) => readFileSync(join(linterDir, file), 'utf8'))
			.join('\n');

		expect(source).not.toMatch(/from '.*\/ai\//);
		expect(source).not.toMatch(/getAiProvider|generate\(/);
	});
});

describe('what the linter must never claim', () => {
	it('says nothing about how other communities read a word', () => {
		// UI spec §8, and spec review log #28. The mockup's panel read:
		//   ⚠ Vague word: "regularly" — three of eleven communities read this as
		//     monthly, eight as weekly
		//
		// Producing that needs many communities, their definitions pooled, and
		// their consent to the pooling — the opt-in pattern library, deliberately
		// post-MVP. At MVP the sentence could only be invented, and a developer
		// implementing the mockup literally would be tempted to invent it. This
		// is here so that temptation fails a test rather than reaching a screen.
		const messages = allFindings(
			of('Candidates attend the assembly regularly, otherwise they remain candidates.')
		)
			.map((finding) => finding.message)
			.join(' ');

		expect(messages).toMatch(/vague word/i);
		expect(messages).not.toMatch(/communities/i);
		expect(messages).not.toMatch(/\b\d+ of \d+\b/);
	});
});
