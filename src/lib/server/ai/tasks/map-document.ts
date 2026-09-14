import * as v from 'valibot';
import type { Ctx } from '../../auth/guard.js';
import type { Db } from '../../db/index.js';
import { getLogger } from '../../logger.js';
import {
	MAP_DOCUMENT_JSON_SCHEMA,
	MAP_DOCUMENT_MAX_OUTPUT_TOKENS,
	MAP_DOCUMENT_REASON_MAX,
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

export type Suggestion = {
	passageId: string;
	clauseKey: string;
	confidence: number;
	/** One plain sentence, normalised. Always present: a pairing without one is discarded. */
	reason: string;
	/** Offsets into the passage text, when the model quoted words that are really there. */
	excerpt: { start: number; end: number } | null;
};

/** The languages a community can choose, as a model is told them. */
const LANGUAGE: Record<string, string> = { en: 'English', de: 'German', es: 'Spanish' };

/**
 * A reason as it will be stored and shown: control characters and newlines
 * collapsed, trimmed. Null when nothing usable is left or it runs long — the
 * pairing is then discarded, because a suggestion that cannot explain itself is
 * not one a member can judge.
 */
export function cleanReason(raw: string | undefined): string | null {
	if (typeof raw !== 'string') return null;
	// Control characters by code point rather than in a regex class, which the
	// linter rightly distrusts: they become spaces, then whitespace collapses.
	const spaced = [...raw]
		.map((ch) => {
			const code = ch.codePointAt(0)!;
			return code < 0x20 || code === 0x7f ? ' ' : ch;
		})
		.join('');
	const clean = spaced.replace(/\s+/g, ' ').trim();
	if (clean.length === 0 || clean.length > MAP_DOCUMENT_REASON_MAX) return null;
	return clean;
}

/**
 * Where the model's excerpt really sits in the passage, ignoring differences of
 * whitespace — or null when those words are not there. A model paraphrasing
 * into the "excerpt" field would otherwise highlight words the community never
 * wrote. The offsets are into the original text, so the highlight is exact.
 */
export function locateExcerpt(
	passage: string,
	excerpt: string | undefined
): { start: number; end: number } | null {
	if (typeof excerpt !== 'string') return null;
	const needle = excerpt.replace(/\s+/g, ' ').trim();
	if (needle.length === 0) return null;

	// Collapse the passage the same way, remembering each kept character's origin.
	let collapsed = '';
	const origin: number[] = [];
	let inSpace = false;
	for (let i = 0; i < passage.length; i++) {
		const ch = passage[i]!;
		if (/\s/.test(ch)) {
			if (!inSpace && collapsed.length > 0) {
				collapsed += ' ';
				origin.push(i);
			}
			inSpace = true;
		} else {
			collapsed += ch;
			origin.push(i);
			inSpace = false;
		}
	}

	const at = collapsed.indexOf(needle);
	if (at < 0) return null;
	return { start: origin[at]!, end: origin[at + needle.length - 1]! + 1 };
}

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
		/** Only paragraphs are numbered; a heading arrives as another passage's `under`. */
		passages: { id: string; text: string; kind: 'heading' | 'paragraph'; under: string | null }[];
		requirements: { key: string; ref: string; asks: string }[];
	},
	options: { db?: Db } = {}
): Promise<MappingBatch> {
	const none = (result: AiResult): MappingBatch => ({ suggestions: [], result, discarded: 0 });

	// Defended here as well as by the caller: a heading is never a candidate,
	// whoever hands one over.
	const candidates = input.passages.filter((passage) => passage.kind === 'paragraph');

	if (candidates.length === 0 || input.requirements.length === 0) {
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
	const numbered = candidates.map((passage, index) => ({ n: index + 1, ...passage }));
	const byNumber = new Map(numbered.map((passage) => [passage.n, passage]));
	const byRef = new Map(input.requirements.map((item) => [item.ref, item.key]));

	const result = await runAiTask(
		ctx,
		{
			task: 'map-document',
			system: MAP_DOCUMENT_SYSTEM,
			input: mapDocumentInput({
				passages: numbered.map(({ n, text, under }) => ({ n, text, under })),
				requirements: input.requirements.map(({ ref, asks }) => ({ ref, asks })),
				language: LANGUAGE[ctx.community.locale] ?? 'English'
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
		const passage = byNumber.get(pair.passage);
		const clauseKey = byRef.get(pair.requirement.trim());
		const reason = cleanReason(pair.reason);

		// Anything naming something we did not send is dropped. This is where a
		// document's instructions to the model die: it can ask for whatever it
		// likes, and only pairs drawn from what we supplied survive. A pairing
		// that cannot say why is dropped the same way.
		if (!passage || !clauseKey || reason === null) {
			discarded += 1;
			continue;
		}

		const key = `${passage.id}:${clauseKey}`;
		if (seen.has(key)) continue;
		seen.add(key);

		suggestions.push({
			passageId: passage.id,
			clauseKey,
			confidence: Math.round(pair.confidence),
			reason,
			excerpt: locateExcerpt(passage.text, pair.excerpt)
		});
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
