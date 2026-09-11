import {
	LINT_SHAPE,
	type Finding,
	type LineJob,
	type LintedLine,
	type LintResult,
	type Remedy
} from '../../shared/linter.js';
import { segmentLines } from './segment.js';
import { plainText } from '../markdown.js';
import { hasVaguenessList, VAGUE_WORDS } from './vagueness.js';

/**
 * The definition linter, rule-based half. docs/11-definition-linter.md.
 *
 * Three things it is not, and each is load-bearing:
 *
 * - **It never blocks a freeze.** A community may adopt a definition the linter
 *   dislikes; the result is stored with the version so the disagreement is
 *   visible later rather than argued about.
 * - **It runs with no AI provider.** Everything here is text and word lists. The
 *   two `ai-assist` rules (§3 `enf.auditable`, §2 `type.mismatch` in its full
 *   form) land in P4 and degrade to *silence*, never to a guess.
 * - **It says what passed.** Affirmative checks are shown because the mockups
 *   show them, and because a panel that only ever complains is a panel people
 *   learn to close.
 */

export type { Finding, LineJob, LintedLine, LintResult, Severity } from '../../shared/linter.js';
/** @deprecated A body no longer has one type. Kept for callers being migrated. */
export type DefinitionType = LineJob;

export type LintInput = {
	body: string;
	plainLanguage?: string | null;
	locale?: string;
	/** Titles of adopted definitions, for the overlap check. */
	adoptedElsewhere?: { key: string; title: string; body: string }[];
	/** Whether this section belongs to Layer 0. */
	layer?: number | null;
};

// --- Signals ---------------------------------------------------------------
//
// Deliberately shallow: word and shape matching, in one place, so the rules read
// as rules rather than as regular expressions scattered through a function. The
// deep version of each of these is an `ai-assist` rule in P4.

const OBLIGATION = /\b(must|shall|are expected to|is expected to|required to|obliged to)\b/i;
const ABSOLUTE = /\b(never|always|must not|must|shall not|shall|under no circumstances)\b/i;
const DEFAULTING = /\b(by default|generally|unless|normally|as a rule|ordinarily)\b/i;
const TRADEOFF = /\b(over|rather than|before|in preference to|ahead of|balanced against)\b/i;
const OVERRIDE = /\b(override|overridden|depart from|exception|recorded reason|with a reason)\b/i;
const NONBINDING =
	/\b(aspiration|aspirational|non-binding|not binding|we hope|we aspire|a value)\b/i;
const PROCESS =
	/\b(assembly|circle|council|consent|vote|votes|voting|decision|meeting|process|procedure|reviewed?|approves?|approval|confirms?|nominates?|elects?|appoints?)\b/i;
const CONSEQUENCE =
	/\b(otherwise|if not|fails?|failure|then|consequence|forfeits?|loses|removed|suspended|revoked|does not|shall not|may not|is refused|reverts?)\b/i;
/**
 * Language about who the community *is*, rather than what it requires.
 *
 * Only the clutter rule reads this, and only to stay quiet: a line that says
 * something about identity changes who a community attracts, so deleting it
 * changes something even though nothing in it binds. Without this signal the
 * quietest rule in the set would tell people to cut their own values.
 */
const IDENTITY =
	/\b(we are|we value|we believe|we welcome|we care|we seek|we intend|our (?:values?|culture|character|spirit|intention)|community of|committed to)\b/i;

/** Who or what is bound: a named role, or a person-shaped noun. */
const SUBJECT =
	/\b(member|members|steward|stewards|candidate|candidates|applicant|applicants|resident|residents|person|people|anyone|everyone|the assembly|the circle|the council|treasurer|facilitator|guest|guests)\b/i;
const LAYER0 =
	/\b(purpose|scope|invariant|invariants|identity|mission|who we are|non-goal|non-goals)\b/i;

const ok = (rule: string, message: string): Finding => ({ rule, severity: 'ok', message });
const warn = (rule: string, message: string, span?: string): Finding => ({
	rule,
	severity: 'blocker_shaped',
	message,
	...(span ? { span } : {})
});
const note = (rule: string, message: string, span?: string): Finding => ({
	rule,
	severity: 'note',
	message,
	...(span ? { span } : {})
});

/** Words shared between two texts, ignoring the ones every sentence has. */
const COMMON = new Set([
	'the',
	'a',
	'an',
	'and',
	'or',
	'of',
	'to',
	'in',
	'is',
	'are',
	'be',
	'for',
	'with',
	'that',
	'this',
	'it',
	'as',
	'by',
	'on',
	'at',
	'from',
	'not',
	'we',
	'our'
]);

function significantWords(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.split(/[^a-z0-9']+/)
			.filter((word) => word.length > 3 && !COMMON.has(word))
	);
}

function overlap(a: string, b: string): number {
	const left = significantWords(a);
	const right = significantWords(b);
	if (left.size === 0 || right.size === 0) return 0;
	let shared = 0;
	for (const word of left) if (right.has(word)) shared += 1;
	return shared / Math.min(left.size, right.size);
}

/**
 * Judge one body, line by line.
 *
 * The unit is the sentence, not the body. A definition mixing a rule and a value
 * is normal, and the line the label does not fit is exactly the one that goes
 * unchecked when a whole body carries a single type — which is how an unlabelled
 * value ends up sitting beside real rules, the case the guide calls dangerous.
 */
export function lint(input: LintInput): LintResult {
	const locale = input.locale ?? 'en';
	// The rules read prose, not Markdown: a link's URL is not part of what the
	// definition says, and would otherwise trip the word matchers.
	const text = plainText(input.body);
	const lines = segmentLines(text, locale).map((line) => judge(line, locale, input));

	const bodyFindings = wholeBodyFindings(text, input, locale);
	const all = [...bodyFindings, ...lines.flatMap((line) => line.findings)];

	return {
		shape: LINT_SHAPE,
		lines,
		bodyFindings,
		primaryJob: primaryJobOf(lines),
		clean: all.every((finding) => finding.severity !== 'blocker_shaped'),
		ranAt: Date.now()
	};
}

/**
 * What job a line does, inferred — nobody declares one yet.
 *
 * Conservative on purpose. A badge on every line looks finished, but an inferred
 * `expressive` on a line that actually binds tells a reader it is safe to
 * ignore. Anything that does not read unambiguously as one job stays unlabelled,
 * and `line.ambiguous-middle` fires on the dangerous part of that.
 */
function inferJob(text: string): LineJob | null {
	// An explicit non-binding marker is the author telling you outright.
	if (NONBINDING.test(text)) return 'expressive';

	// A trade-off with a default is the interpretive shape: "X over Y, unless…".
	// Checked before identity, because "we value X over Y by default" is a
	// principle with a default, not a sentence about who we are.
	if (TRADEOFF.test(text) && DEFAULTING.test(text)) return 'interpretive';

	/**
	 * Somebody bound, plus something that can actually be checked.
	 *
	 * Two shapes, and the difference between them is the whole rule:
	 *
	 * - a subject and a **consequence** — "members must give notice, otherwise the
	 *   departure is not recorded". Governance prose states rules in the
	 *   indicative at least as often as with "must", so the modal cannot be
	 *   required; what makes it a rule is that something turns on it.
	 * - a subject, a named **process** and obligation language — "members must
	 *   tell the assembly in writing". Checkable because there is a body that
	 *   either received it or did not.
	 *
	 * Deliberately *not* subject + obligation on its own. That is precisely the
	 * ambiguous middle — "candidates are expected to show up with humility" binds
	 * somebody and offers nothing to check — and calling it enforceable would
	 * silence the one rule this change exists for.
	 */
	const bound = SUBJECT.test(text);
	if (bound && (CONSEQUENCE.test(text) || (PROCESS.test(text) && OBLIGATION.test(text)))) {
		return 'enforceable';
	}

	// Last, and only if nothing above fits: a line about who the community is.
	if (IDENTITY.test(text)) return 'expressive';

	return null;
}

function judge(text: string, locale: string, input: LintInput): LintedLine {
	const job = inferJob(text);
	const findings: Finding[] = [];
	const push = (finding: Finding) => findings.push(finding);

	// --- §3 Enforceable ----------------------------------------------------
	if (job === 'enforceable') {
		push(
			SUBJECT.test(text)
				? ok('enf.subject', 'Has a subject — it is clear who this binds.')
				: warn(
						'enf.subject',
						'Who does this bind? A rule with no subject binds everyone and no one.'
					)
		);
		push(
			PROCESS.test(text)
				? ok('enf.process', 'Has a process — it says how this happens.')
				: warn('enf.process', 'How does this happen, and who does it?')
		);
		if (!CONSEQUENCE.test(text)) {
			push(
				warn(
					'enf.consequence',
					'No consequence if the criteria are not met — what happens to someone the process does not confirm?'
				)
			);
		}
		// The application satisfies §3's `enf.recorded` by construction, and says
		// so rather than staying silent: a passing check a member can see is worth
		// more than one they have to infer.
		push(ok('enf.recorded', 'Recorded here, versioned, and visible to every member.'));
	}

	// --- §4 Interpretive ---------------------------------------------------
	if (job === 'interpretive') {
		if (!TRADEOFF.test(text)) {
			push(
				warn(
					'int.tradeoff',
					'An interpretive principle names a trade-off. What is this choosing between?'
				)
			);
		}
		if (!DEFAULTING.test(text)) {
			push(
				warn(
					'int.default',
					'Say this is a default. Without that word it reads as absolute, and real situations will break it.'
				)
			);
		}
		if (!OVERRIDE.test(text)) {
			push(
				note(
					'int.overridable',
					'Can a decision override this? Say so, and say that the reason gets recorded.'
				)
			);
		}
		const absolute = ABSOLUTE.exec(text);
		if (absolute) {
			push(
				warn(
					'int.absolute',
					'This is written as an absolute. If it is a rule, mark it Enforceable; if it is a lean, soften it.',
					absolute[0]
				)
			);
		}
	}

	// --- §5 Expressive -----------------------------------------------------
	if (job === 'expressive') {
		const obligation = OBLIGATION.exec(text);
		if (obligation) {
			push(
				warn(
					'exp.obligation',
					'This is written as an obligation. Either make it Enforceable with a process, or drop the obligation words.',
					obligation[0]
				)
			);
		}
	}

	// --- §7 The ambiguous middle -------------------------------------------
	//
	// The one rule the whole change exists for, and the one that could not work
	// before: it fires on an *unlabelled* line, which is precisely what a
	// whole-body type made unreachable. Language that binds, nothing anybody
	// could check yes or no, and no non-binding marker.
	const ambiguous =
		job === null && OBLIGATION.test(text) && !CONSEQUENCE.test(text) && !NONBINDING.test(text);
	if (ambiguous) {
		findings.push({
			rule: 'line.ambiguous-middle',
			severity: 'blocker_shaped',
			message:
				'The ambiguous middle. This sounds binding but nothing here could be checked yes or no — so it will be enforced informally, by whoever feels strongly. Push it to one side.',
			// Three governance acts, none of them the linter's to choose.
			remedies: ['make_enforceable', 'label_non_binding', 'delete_line'] satisfies Remedy[]
		});
	}

	// --- §6.1 Vagueness, per line ------------------------------------------
	if (hasVaguenessList(locale)) {
		for (const word of VAGUE_WORDS[locale]!) {
			if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
				push(
					warn(
						'all.vague',
						`Vague word: "${word}" — say how, or this becomes an argument later.`,
						word
					)
				);
			}
		}
	}

	// --- §7 Clutter ---------------------------------------------------------
	//
	// The guide's fourth outcome, and the quietest rule of the four. Never on a
	// line already reported as the ambiguous middle: that line's problem is that
	// it may bind, and telling somebody to delete a possible rule is the wrong
	// advice entirely.
	if (!ambiguous) {
		const duplicates = (input.adoptedElsewhere ?? []).find(
			(other) => overlap(text, plainText(other.body)) >= 0.6
		);
		if (duplicates) {
			findings.push({
				rule: 'line.clutter',
				severity: 'note',
				message: `This is already binding in "${duplicates.title}". Point to it rather than restating it — a re-stated MUST starts to look optional.`,
				remedies: ['delete_line'] satisfies Remedy[]
			});
		} else if (
			job === null &&
			!OBLIGATION.test(text) &&
			!TRADEOFF.test(text) &&
			!NONBINDING.test(text) &&
			!IDENTITY.test(text) &&
			!(SUBJECT.test(text) && PROCESS.test(text))
		) {
			findings.push({
				rule: 'line.clutter',
				severity: 'note',
				message:
					'If this line were deleted, what would change? If nothing, it is clutter — and clutter dilutes the lines that do matter.',
				remedies: ['delete_line'] satisfies Remedy[]
			});
		}
	}

	if (LAYER0.test(text)) {
		push(
			note(
				'all.layer0',
				'This touches Layer 0. It needs the constitutional decision path, not an ordinary freeze.'
			)
		);
	}

	return { text, job, source: 'inferred', findings };
}

/**
 * Findings about the body rather than about any one line.
 *
 * The plain-language mirror is a property of the whole definition, and the
 * vagueness list's absence is a statement about the locale. Neither has a line
 * to point at, which is why `Finding.line` is optional.
 */
function wholeBodyFindings(text: string, input: LintInput, locale: string): Finding[] {
	const findings: Finding[] = [];

	if (!hasVaguenessList(locale)) {
		// Visibly, never silently: a community must not believe their text was
		// checked for something nobody has written the list for yet.
		findings.push(
			note('all.vague.unavailable', `Vagueness checks are not available in ${locale} yet.`)
		);
	}

	if (input.layer === 0) {
		findings.push(
			note(
				'all.layer0',
				'This touches Layer 0. It needs the constitutional decision path, not an ordinary freeze.'
			)
		);
	}

	const plain = (input.plainLanguage ?? '').trim();
	if (!plain) {
		findings.push(
			warn(
				'all.plain',
				'Add what this means in practice. Most forgetting is that nobody rereads governance prose.'
			)
		);
	} else if (overlap(plain, text) >= 0.9) {
		findings.push(
			warn('all.plain', 'The plain-language version is a copy of the body. Say it differently.')
		);
	}

	return findings;
}

/**
 * The strongest job present, not the commonest.
 *
 * A definition with four expressive lines and one enforceable line is, to anyone
 * bound by it, an enforceable definition. A majority rule would label it
 * expressive — which is `docs/11` §7's own "don't demote an enforced rule into a
 * value" anti-pattern, arrived at by arithmetic.
 */
export function primaryJobOf(lines: { job: LineJob | null }[]): LineJob | null {
	const order: LineJob[] = ['enforceable', 'interpretive', 'expressive'];
	return order.find((job) => lines.some((line) => line.job === job)) ?? null;
}
