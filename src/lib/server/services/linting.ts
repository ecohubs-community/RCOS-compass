import type { Ctx } from '../auth/guard.js';
import type { Db } from '../db/index.js';
import { assistedFindings } from '../ai/tasks/lint-definition.js';
import { aiAvailability } from '../ai/run.js';
import { lint, type LintInput, type LintResult } from '../linter/index.js';
import type { Finding } from '../../shared/linter.js';

/**
 * The rule set, plus the two questions a word list cannot answer.
 * docs/11-definition-linter.md §8.
 *
 * **This lives outside `src/lib/server/linter/` on purpose.** That directory is
 * asserted to be unable to reach a provider at all — a structural guarantee that
 * the rule-based half runs with `AI_PROVIDER=null`, which is what makes the
 * linter a product promise rather than an AI feature. Composing the two halves
 * is a service's job, and putting it here means the guarantee survives.
 *
 * `lint()` keeps its signature and stays synchronous. The freeze path and the
 * discussion thread call it on every render, and making that path async and
 * provider-dependent to serve two rules would put an optional feature in the way
 * of a required one.
 */

/** The finding that says a check did not happen, rather than that it passed. */
export const ASSIST_UNAVAILABLE = 'all.assist.unavailable';

export type AssistedLintResult = LintResult & {
	/** Whether the two assisted rules actually ran. */
	assisted: boolean;
};

/**
 * Run the rule set, and the assisted rules when they can be run.
 *
 * Called **on request**, never on render. The assisted pass costs a member one
 * of their daily tasks, and spending that because somebody opened a page would
 * empty an allowance nobody chose to use — a screen that quietly bills you for
 * looking at it is a screen people learn to avoid.
 */
export async function lintWithAssist(
	ctx: Ctx,
	input: LintInput,
	options: { db?: Db } = {}
): Promise<AssistedLintResult> {
	const base = lint(input);

	const refusal = aiAvailability(ctx, options);
	if (refusal) return withUnavailable(base, refusal.ok === false ? refusal.reason : '');

	const outcome = await assistedFindings(
		ctx,
		{ body: input.body, type: input.type ?? null },
		options
	);

	if (outcome.findings.length === 0) {
		return withUnavailable(
			base,
			outcome.result.ok
				? 'The assisted checks did not return a usable answer this time.'
				: outcome.result.reason
		);
	}

	// The rule set wins where both speak. `type.mismatch` exists in both halves —
	// the shallow one catches obligation words under an aspirational label — and
	// two findings with the same rule would read as two problems rather than one.
	const already = new Set(base.findings.map((finding) => finding.rule));
	const added = outcome.findings.filter((finding) => !already.has(finding.rule));

	const findings = [...base.findings, ...added];
	return {
		findings,
		clean: findings.every((finding) => finding.severity !== 'blocker_shaped'),
		assisted: true
	};
}

/**
 * Say the check was not run — never let it look like a check that passed.
 *
 * The same shape as `all.vague.unavailable` in the rule set, and for the same
 * reason: a community must not believe their text was examined for something
 * nobody examined it for.
 */
function withUnavailable(base: LintResult, why: string): AssistedLintResult {
	const notice: Finding = {
		rule: ASSIST_UNAVAILABLE,
		severity: 'note',
		message:
			`Two checks were not run: whether an auditor could verify this, and whether it reads as the type it is labelled. ${why}`.trim()
	};

	return {
		findings: [...base.findings, notice],
		// A check that did not happen cannot make a definition unclean.
		clean: base.clean,
		assisted: false
	};
}
