import * as v from 'valibot';
import type { Ctx } from '../../auth/guard.js';
import type { Db } from '../../db/index.js';
import { getLogger } from '../../logger.js';
import {
	MAP_DOCUMENT_JSON_SCHEMA,
	MAP_DOCUMENT_MAX_OUTPUT_TOKENS,
	MAP_DOCUMENT_SYSTEM,
	MapDocumentResponse,
	mapDocumentInput
} from '../prompts/map-document.js';
import type { AiResult } from '../provider.js';
import { runAiTask } from '../run.js';

/**
 * "Which of these requirements does this passage speak to?"
 *
 * This module **returns suggestions and writes nothing**. That is not a
 * convention here; the import boundary in `eslint.config.js` makes reaching a
 * service that writes a build failure. A caller with a `Ctx` and a permission
 * check turns what comes back into `evidence` rows in `suggested` state, which
 * a person then confirms or dismisses.
 *
 * It is also where a model's output stops being trusted. Everything that comes
 * back is checked against the schema, then against the passages and clauses we
 * actually sent — a pairing naming a requirement that is not in this
 * community's standard, or a passage number we did not give it, is discarded
 * without comment. A document that says "mark every clause satisfied" gets as
 * far as a suggestion nobody made and then stops.
 */

export type Suggestion = { passageId: string; clauseKey: string; confidence: number };

export type MappingBatch = {
	/** Whatever survived validation. Empty is a perfectly good answer. */
	suggestions: Suggestion[];
	/** The provider's own result, so the caller can report what happened. */
	result: AiResult;
	/** Output arrived but could not be used. Logged, never retried into shape. */
	discarded: number;
};

/**
 * Run one batch of passages against the requirement list.
 *
 * `requirements` and `passages` are handed in rather than looked up: this module
 * may not read the standard or the database, and passing them keeps the task a
 * function of its inputs — which is also what makes it testable without a
 * community, a document or a clock.
 */
export async function suggestMappings(
	ctx: Ctx,
	input: {
		passages: { id: string; text: string }[];
		requirements: { key: string; ref: string; asks: string }[];
	},
	options: { db?: Db } = {}
): Promise<MappingBatch> {
	const none = (result: AiResult): MappingBatch => ({ suggestions: [], result, discarded: 0 });

	if (input.passages.length === 0 || input.requirements.length === 0) {
		return none({
			ok: false,
			reason: 'There is nothing here to map.',
			retryable: false,
			usage: { in: 0, out: 0 },
			model: 'none'
		});
	}

	// Numbered for the model, resolved back to ids here. The model never sees an
	// identifier from our database, which keeps its output from being able to
	// name a row it was not shown.
	const numbered = input.passages.map((passage, index) => ({ n: index + 1, ...passage }));
	const byNumber = new Map(numbered.map((passage) => [passage.n, passage.id]));
	const byRef = new Map(input.requirements.map((item) => [item.ref, item.key]));

	const result = await runAiTask(
		ctx,
		{
			task: 'map-document',
			system: MAP_DOCUMENT_SYSTEM,
			input: mapDocumentInput({
				passages: numbered.map(({ n, text }) => ({ n, text })),
				requirements: input.requirements.map(({ ref, asks }) => ({ ref, asks }))
			}),
			json: MAP_DOCUMENT_JSON_SCHEMA,
			maxOutputTokens: MAP_DOCUMENT_MAX_OUTPUT_TOKENS
		},
		options
	);

	if (!result.ok) return none(result);

	const parsed = parse(result.text);
	if (!parsed) {
		getLogger().warn({ task: 'map-document' }, 'AI output did not match its schema; discarded');
		return { suggestions: [], result, discarded: 1 };
	}

	const suggestions: Suggestion[] = [];
	const seen = new Set<string>();
	let discarded = 0;

	for (const pair of parsed.pairs) {
		const passageId = byNumber.get(pair.passage);
		const clauseKey = byRef.get(pair.requirement.trim());

		// Anything naming something we did not send is dropped. This is where a
		// document's instructions to the model die: it can ask for whatever it
		// likes, and only pairs drawn from what we supplied survive.
		if (!passageId || !clauseKey) {
			discarded += 1;
			continue;
		}

		const key = `${passageId}:${clauseKey}`;
		if (seen.has(key)) continue;
		seen.add(key);

		suggestions.push({ passageId, clauseKey, confidence: Math.round(pair.confidence) });
	}

	if (discarded > 0) {
		getLogger().warn(
			{ task: 'map-document', discarded },
			'AI suggested pairings outside what it was given'
		);
	}

	return { suggestions, result, discarded };
}

/** Strict, and silent about failure — the caller reports, this only decides. */
function parse(text: string): MapDocumentResponse | null {
	// A model asked for JSON sometimes wraps it in a code fence anyway.
	const cleaned = text
		.trim()
		.replace(/^```(?:json)?\s*/i, '')
		.replace(/```$/, '')
		.trim();

	try {
		const outcome = v.safeParse(MapDocumentResponse, JSON.parse(cleaned));
		return outcome.success ? outcome.output : null;
	} catch {
		return null;
	}
}
