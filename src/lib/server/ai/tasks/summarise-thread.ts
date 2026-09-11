import * as v from 'valibot';
import type { Ctx } from '../../auth/guard.js';
import type { Db } from '../../db/index.js';
import { getLogger } from '../../logger.js';
import {
	DRAFT_JSON_SCHEMA,
	DRAFT_SYSTEM,
	DraftResponse,
	SUMMARISE_JSON_SCHEMA,
	SUMMARISE_SYSTEM,
	SummariseResponse,
	THREAD_MAX_OUTPUT_TOKENS,
	threadInput
} from '../prompts/summarise-thread.js';
import type { AiResult } from '../provider.js';
import { runAiTask } from '../run.js';

/**
 * What a thread says, and what a rule made of it might look like.
 *
 * Like every task under this directory it writes nothing: it returns text, and
 * a caller hands that text to a person. The summary arrives in the reply box;
 * the draft arrives in the proposal editor. Both are edited and submitted by a
 * member under their own name, which is the only way either becomes a post.
 */

export type ThreadTextOutcome = { text: string | null; result: AiResult };

export async function summariseThread(
	ctx: Ctx,
	posts: { kind: string; body: string }[],
	options: { db?: Db } = {}
): Promise<ThreadTextOutcome> {
	return ask(ctx, posts, options, {
		task: 'summarise-thread',
		system: SUMMARISE_SYSTEM,
		json: SUMMARISE_JSON_SCHEMA,
		schema: SummariseResponse,
		field: 'summary'
	});
}

export async function draftProposalFromThread(
	ctx: Ctx,
	posts: { kind: string; body: string }[],
	options: { db?: Db } = {}
): Promise<ThreadTextOutcome> {
	return ask(ctx, posts, options, {
		task: 'summarise-thread',
		system: DRAFT_SYSTEM,
		json: DRAFT_JSON_SCHEMA,
		schema: DraftResponse,
		field: 'draft'
	});
}

async function ask(
	ctx: Ctx,
	posts: { kind: string; body: string }[],
	options: { db?: Db },
	spec: {
		task: 'summarise-thread';
		system: string;
		json: object;
		schema: typeof SummariseResponse | typeof DraftResponse;
		field: 'summary' | 'draft';
	}
): Promise<ThreadTextOutcome> {
	const result = await runAiTask(
		ctx,
		{
			task: spec.task,
			system: spec.system,
			input: threadInput(posts),
			json: spec.json,
			maxOutputTokens: THREAD_MAX_OUTPUT_TOKENS
		},
		options
	);

	if (!result.ok) return { text: null, result };

	const parsed = parse(result.text, spec.schema, spec.field);
	if (parsed === null) {
		// Silence, never a guess. Prose where JSON was asked for is no answer, and
		// the caller says the suggestion could not be made rather than inventing
		// one.
		getLogger().warn({ task: spec.task }, 'AI output did not match its schema; discarded');
	}
	return { text: parsed, result };
}

function parse(
	text: string,
	schema: typeof SummariseResponse | typeof DraftResponse,
	field: 'summary' | 'draft'
): string | null {
	try {
		const value = v.parse(schema, JSON.parse(text)) as Record<string, string>;
		const out = value[field]?.trim();
		return out ? out : null;
	} catch {
		return null;
	}
}
