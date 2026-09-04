import * as v from 'valibot';
import type { Ctx } from '../../auth/guard.js';
import type { Db } from '../../db/index.js';
import { getLogger } from '../../logger.js';
import type { Finding } from '../../../shared/linter.js';
import {
	LINT_JSON_SCHEMA,
	LINT_MAX_OUTPUT_TOKENS,
	LINT_SYSTEM,
	LintDefinitionResponse,
	lintInput
} from '../prompts/lint-definition.js';
import type { AiResult } from '../provider.js';
import { runAiTask } from '../run.js';

/**
 * The linter's two assisted rules, as findings — and nothing else.
 *
 * Like every task under this directory, it writes nothing: it returns findings
 * and a caller decides what to do with them. The linter itself stays a pure,
 * synchronous function of text (`tests/unit/linter.test.ts` asserts it cannot
 * even reach a provider), and the composition happens in a service.
 */

export type AssistOutcome = { findings: Finding[]; result: AiResult };

export async function assistedFindings(
	ctx: Ctx,
	input: { body: string; type: string | null },
	options: { db?: Db } = {}
): Promise<AssistOutcome> {
	const result = await runAiTask(
		ctx,
		{
			task: 'lint-definition',
			system: LINT_SYSTEM,
			input: lintInput(input),
			json: LINT_JSON_SCHEMA,
			maxOutputTokens: LINT_MAX_OUTPUT_TOKENS
		},
		options
	);

	if (!result.ok) return { findings: [], result };

	const judgement = parse(result.text);
	if (!judgement) {
		// Silence, never a guess. An unparseable answer is the same as no answer,
		// and the caller reports it as a check that was not run.
		getLogger().warn({ task: 'lint-definition' }, 'AI output did not match its schema; discarded');
		return { findings: [], result };
	}

	const findings: Finding[] = [];

	// RCOS §2.4.3: an identity constraint must be testable. The affirmative case
	// is reported too — a panel that only ever complains is one people close.
	findings.push(
		judgement.auditable
			? {
					rule: 'enf.auditable',
					severity: 'ok',
					message: `An auditor could check this. ${judgement.auditableWhy}`.trim()
				}
			: {
					rule: 'enf.auditable',
					severity: 'blocker_shaped',
					message:
						`An auditor could not check this yes or no. What would they look at? ${judgement.auditableWhy}`.trim()
				}
	);

	// Only when it disagrees with the label, and only when it is sure enough to
	// name what it read instead. "unclear" is not a mismatch; it is a shrug, and
	// a shrug is not worth a member's attention.
	if (input.type && judgement.readsAs !== 'unclear' && judgement.readsAs !== input.type) {
		findings.push({
			rule: 'type.mismatch',
			severity: 'note',
			message:
				`This is labelled ${input.type} but reads as ${judgement.readsAs}. ${judgement.readsAsWhy}`.trim()
		});
	}

	return { findings, result };
}

function parse(text: string): LintDefinitionResponse | null {
	const cleaned = text
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/```$/, '')
		.trim();
	try {
		const outcome = v.safeParse(LintDefinitionResponse, JSON.parse(cleaned));
		return outcome.success ? outcome.output : null;
	} catch {
		return null;
	}
}
