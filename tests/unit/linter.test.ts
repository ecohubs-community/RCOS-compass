import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lint, type LintInput } from '../../src/lib/server/linter/index.js';

/**
 * The rule set. docs/11-definition-linter.md §8.
 *
 * Table-driven, one fixture per rule with a passing and a failing example, drawn
 * from the guide's own good and anti-pattern examples. The whole set runs with
 * no AI provider — everything here is text and word lists, and the two
 * `ai-assist` rules land in P4 and degrade to silence rather than to a guess.
 */
const linterDir = join(import.meta.dirname, '../../src/lib/server/linter');
const rules = (input: LintInput) => lint(input).findings.map((f) => f.rule);
const severityOf = (input: LintInput, rule: string) =>
	lint(input).findings.find((f) => f.rule === rule)?.severity;

/** A body good enough that only the rule under test should fire. */
const clean = {
	plainLanguage: 'In practice: the assembly confirms you, or you stay a candidate.',
	locale: 'en'
};

describe('the type comes first', () => {
	it('asks for one when none is chosen', () => {
		expect(rules({ ...clean, body: 'Members may leave.' })).toContain('type.missing');
	});

	it('notices obligation language under an aspirational label', () => {
		// The shallow half of type.mismatch. The full version is ai-assist.
		expect(
			rules({ ...clean, type: 'expressive', body: 'Members must show up with humility.' })
		).toContain('type.mismatch');
	});
});

describe('enforceable', () => {
	const enforceable = (body: string) => ({ ...clean, type: 'enforceable' as const, body });

	it('passes a definition with a subject, a process and a consequence', () => {
		const good = enforceable(
			'A candidate is admitted by a consent decision of the assembly. If the assembly does not confirm them, they remain a candidate.'
		);
		expect(severityOf(good, 'enf.subject')).toBe('ok');
		expect(severityOf(good, 'enf.process')).toBe('ok');
		expect(rules(good)).not.toContain('enf.consequence');
	});

	it('flags a missing subject', () => {
		// "We value diversity" marked Enforceable — the guide's own anti-pattern.
		expect(rules(enforceable('Diversity is valued here.'))).toContain('enf.subject');
	});

	it('flags a missing process', () => {
		expect(rules(enforceable('A member is admitted somehow.'))).toContain('enf.process');
	});

	it('flags a missing consequence', () => {
		expect(
			rules(enforceable('A candidate is admitted by a consent decision of the assembly.'))
		).toContain('enf.consequence');
	});

	it('says the record-keeping check passes, rather than staying silent', () => {
		// A panel that only ever complains is a panel people learn to close.
		expect(severityOf(enforceable('A member is admitted by the assembly.'), 'enf.recorded')).toBe(
			'ok'
		);
	});
});

describe('interpretive', () => {
	const interpretive = (body: string) => ({ ...clean, type: 'interpretive' as const, body });

	it('passes a trade-off stated as a default with a recorded override', () => {
		const good = interpretive(
			'Transparency over control, by default; an override is recorded with its reason.'
		);
		expect(rules(good)).not.toContain('int.tradeoff');
		expect(rules(good)).not.toContain('int.default');
		expect(rules(good)).not.toContain('int.overridable');
		expect(rules(good)).not.toContain('int.absolute');
	});

	it('flags a principle with no trade-off in it', () => {
		expect(rules(interpretive('Members are generally kind, unless tired.'))).toContain(
			'int.tradeoff'
		);
	});

	it('flags one written without a default', () => {
		expect(rules(interpretive('Transparency over control.'))).toContain('int.default');
	});

	it('asks whether a decision can override it', () => {
		expect(rules(interpretive('Transparency over control, by default.'))).toContain(
			'int.overridable'
		);
	});

	it('flags an absolute, and points at the word', () => {
		// "We never delegate authority" marked Interpretive.
		const result = lint(interpretive('We never delegate authority.'));
		const absolute = result.findings.find((f) => f.rule === 'int.absolute')!;
		expect(absolute.severity).toBe('blocker_shaped');
		expect(absolute.span).toBe('never');
	});
});

describe('expressive', () => {
	const expressive = (body: string) => ({ ...clean, type: 'expressive' as const, body });

	it('passes a labelled aspiration', () => {
		const good = expressive('We aspire to welcome newcomers warmly. This is a non-binding value.');
		expect(rules(good)).not.toContain('exp.nonbinding');
		expect(rules(good)).not.toContain('exp.obligation');
	});

	it('asks for the non-binding label', () => {
		expect(rules(expressive('Newcomers are welcomed warmly.'))).toContain('exp.nonbinding');
	});

	it('flags obligation language, and points at it', () => {
		// "Members are expected to show up with humility" marked Expressive.
		const result = lint(expressive('Members are expected to show up with humility.'));
		const obligation = result.findings.find((f) => f.rule === 'exp.obligation')!;
		expect(obligation.span?.toLowerCase()).toBe('are expected to');
	});
});

describe('every type', () => {
	it('flags a vague word and names it', () => {
		// "Candidates attend the assembly regularly."
		const result = lint({
			...clean,
			type: 'enforceable',
			body: 'Candidates attend the assembly regularly. Otherwise they remain candidates.'
		});
		const vague = result.findings.find((f) => f.rule === 'all.vague')!;
		expect(vague.span).toBe('regularly');
		expect(vague.message).toMatch(/becomes an argument later/);
	});

	it('does not flag a word that merely contains a vague one', () => {
		expect(
			rules({ ...clean, type: 'expressive', body: 'We aspire to irregular gatherings. A value.' })
		).not.toContain('all.vague');
	});

	it('says out loud when it cannot check a language', () => {
		// Silently skipping would let a community believe their text was checked.
		const result = lint({
			...clean,
			type: 'expressive',
			body: 'A non-binding value.',
			locale: 'de'
		});
		expect(result.findings.map((f) => f.rule)).toContain('all.vague.unavailable');
		expect(result.findings.map((f) => f.rule)).not.toContain('all.vague');
	});

	it('asks what would break if the line were deleted', () => {
		expect(rules({ ...clean, type: 'interpretive', body: 'Kindness matters here.' })).toContain(
			'all.kill'
		);
	});

	it('notices a restatement of something already adopted', () => {
		const result = lint({
			...clean,
			type: 'enforceable',
			body: 'Treasury balances are published to every member each month by the treasurer, otherwise the steward publishes them.',
			adoptedElsewhere: [
				{
					key: 'treasury-ruleset.transparency',
					title: 'Transparency and reporting',
					body: 'Treasury balances are published monthly to every member by the treasurer.'
				}
			]
		});
		expect(result.findings.map((f) => f.rule)).toContain('all.duplicate');
	});

	it('sends a Layer 0 definition down the constitutional path', () => {
		expect(
			rules({ ...clean, type: 'enforceable', body: 'Our purpose is regeneration.', layer: 0 })
		).toContain('all.layer0');
	});

	it('asks for a plain-language mirror, and refuses a copy of the body', () => {
		const body =
			'A candidate is admitted by a consent decision of the assembly, otherwise they wait.';
		expect(rules({ type: 'enforceable', body, locale: 'en' })).toContain('all.plain');

		const copied = lint({ type: 'enforceable', body, plainLanguage: body, locale: 'en' });
		expect(copied.findings.find((f) => f.rule === 'all.plain')?.message).toMatch(
			/copy of the body/
		);
	});
});

describe('the linter is advice', () => {
	it('reports cleanliness without ever refusing anything', () => {
		const messy = lint({ type: 'enforceable', body: 'Stuff happens.', locale: 'en' });
		expect(messy.clean).toBe(false);
		// It returns a verdict. It has no way to stop a freeze, because `freeze`
		// never asks it — a community may adopt a definition the linter dislikes,
		// and the disagreement is stored with the version.
		expect(Object.keys(messy)).toEqual(['findings', 'clean']);
	});

	it('cannot reach an AI provider even if one were configured', () => {
		// Asserted structurally rather than by an environment variable: every rule
		// here is text and word lists, and the two ai-assist rules land in P4 as a
		// separate pass that degrades to silence, never to a guess.
		const source = readdirSync(linterDir)
			.filter((file) => file.endsWith('.ts'))
			.map((file) => readFileSync(join(linterDir, file), 'utf8'))
			.join('\n');

		expect(source).not.toMatch(/from '.*\/ai\//);
		expect(source).not.toMatch(/getAiProvider|generate\(/);
	});
});
