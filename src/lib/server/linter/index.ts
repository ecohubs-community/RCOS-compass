import type { Finding } from '../../shared/linter.js';
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

export type { Finding, Severity } from '../../shared/linter.js';
export type DefinitionType = 'enforceable' | 'interpretive' | 'expressive';

export type LintInput = {
	body: string;
	plainLanguage?: string | null;
	type?: DefinitionType | null;
	locale?: string;
	/** Titles of adopted definitions, for the overlap check. */
	adoptedElsewhere?: { key: string; title: string; body: string }[];
	/** Whether this section belongs to Layer 0. */
	layer?: number | null;
};

export type LintResult = {
	findings: Finding[];
	/** True when nothing is `blocker_shaped`. Advice, never a gate. */
	clean: boolean;
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

export function lint(input: LintInput): LintResult {
	const findings: Finding[] = [];
	// The rules read prose, not Markdown: a link's URL is not part of what the
	// definition says, and would otherwise trip the word matchers.
	const text = plainText(input.body);
	const locale = input.locale ?? 'en';

	// --- §2 The type -------------------------------------------------------
	if (!input.type) {
		findings.push(
			warn('type.missing', 'Say what job this line does: does it bind, guide, or describe?')
		);
	}

	// The shallow half of `type.mismatch`: obligation language under a label that
	// says this is not an obligation. The full version is an `ai-assist` rule.
	if (input.type === 'expressive' && OBLIGATION.test(text)) {
		findings.push(
			note('type.mismatch', 'This is labelled aspirational but reads as a rule. Which is it?')
		);
	}

	// --- §3 Enforceable ----------------------------------------------------
	if (input.type === 'enforceable') {
		findings.push(
			SUBJECT.test(text)
				? ok('enf.subject', 'Has a subject — it is clear who this binds.')
				: warn(
						'enf.subject',
						'Who does this bind? A rule with no subject binds everyone and no one.'
					)
		);

		findings.push(
			PROCESS.test(text)
				? ok('enf.process', 'Has a process — it says how this happens.')
				: warn('enf.process', 'How does this happen, and who does it?')
		);

		if (!CONSEQUENCE.test(text)) {
			findings.push(
				warn(
					'enf.consequence',
					'No consequence if the criteria are not met — what happens to someone the process does not confirm?'
				)
			);
		}

		// The application satisfies §3's `enf.recorded` by construction, and says
		// so rather than staying silent: a passing check a member can see is worth
		// more than one they have to infer.
		findings.push(ok('enf.recorded', 'Recorded here, versioned, and visible to every member.'));
	}

	// --- §4 Interpretive ---------------------------------------------------
	if (input.type === 'interpretive') {
		if (!TRADEOFF.test(text)) {
			findings.push(
				warn(
					'int.tradeoff',
					'An interpretive principle names a trade-off. What is this choosing between?'
				)
			);
		}
		if (!DEFAULTING.test(text)) {
			findings.push(
				warn(
					'int.default',
					'Say this is a default. Without that word it reads as absolute, and real situations will break it.'
				)
			);
		}
		if (!OVERRIDE.test(text)) {
			findings.push(
				note(
					'int.overridable',
					'Can a decision override this? Say so, and say that the reason gets recorded.'
				)
			);
		}
		const absolute = ABSOLUTE.exec(text);
		if (absolute) {
			findings.push(
				warn(
					'int.absolute',
					'This is written as an absolute. If it is a rule, mark it Enforceable; if it is a lean, soften it.',
					absolute[0]
				)
			);
		}
	}

	// --- §5 Expressive -----------------------------------------------------
	if (input.type === 'expressive') {
		if (!NONBINDING.test(text)) {
			findings.push(
				warn(
					'exp.nonbinding',
					'Label this non-binding. An unlabelled value sitting next to real rules is exactly the opening for coercion.'
				)
			);
		}
		const obligation = OBLIGATION.exec(text);
		if (obligation) {
			findings.push(
				warn(
					'exp.obligation',
					'This is written as an obligation. Either make it Enforceable with a process, or drop the obligation words.',
					obligation[0]
				)
			);
		}
	}

	// --- §6 Every type -----------------------------------------------------
	if (hasVaguenessList(locale)) {
		for (const word of VAGUE_WORDS[locale]!) {
			if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)) {
				findings.push(
					warn(
						'all.vague',
						`Vague word: "${word}" — say how, or this becomes an argument later.`,
						word
					)
				);
			}
		}
	} else {
		// Visibly, never silently: a community must not believe their text was
		// checked for something nobody has written the list for yet.
		findings.push(
			note('all.vague.unavailable', `Vagueness checks are not available in ${locale} yet.`)
		);
	}

	// "What breaks if we delete this line?"
	if (
		text.trim().length > 0 &&
		!SUBJECT.test(text) &&
		!TRADEOFF.test(text) &&
		!OBLIGATION.test(text) &&
		!NONBINDING.test(text)
	) {
		findings.push(
			note(
				'all.kill',
				'If this line were deleted, what would change? If nothing, it is clutter — and clutter dilutes the lines that do matter.'
			)
		);
	}

	for (const other of input.adoptedElsewhere ?? []) {
		if (overlap(text, plainText(other.body)) >= 0.6) {
			findings.push(
				note(
					'all.duplicate',
					`This is already binding in "${other.title}". Point to it rather than restating it — a re-stated MUST starts to look optional.`
				)
			);
			break;
		}
	}

	if (input.layer === 0 || LAYER0.test(text)) {
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

	return {
		findings,
		clean: findings.every((finding) => finding.severity !== 'blocker_shaped')
	};
}
