import * as v from 'valibot';
import { asData, SYSTEM_PREAMBLE } from './system.js';

/**
 * The mapping task's prompt, schema and ceiling — the three things a task owns.
 * docs/00-architecture.md §4 rule 6.
 *
 * The provider knows nothing about tasks and the task knows nothing about
 * providers, which is what keeps "swap the model" a `.env` change. Everything
 * specific to *this* question lives here, in one reviewable file, versioned with
 * the rest of the code rather than assembled inside a service.
 */

/** Bumped when the wording changes, so a recorded fixture can say what it answered. */
export const MAP_DOCUMENT_PROMPT_VERSION = 1;

/**
 * Deliberately modest about what it is being asked for.
 *
 * The model is not deciding anything. It is pointing at pairs a person will read
 * and accept or reject, and the cost of a wrong suggestion is somebody's
 * attention — so the instruction asks for restraint rather than coverage. A
 * mapping tool that suggests everything is a tool people stop reading.
 */
export const MAP_DOCUMENT_SYSTEM = [
	SYSTEM_PREAMBLE,
	'',
	"You are given numbered passages from the community's document, and a list of",
	'requirements from the standard they are working towards.',
	'',
	'For each passage that plainly speaks to one of the requirements, return that',
	'pairing. Judge only what the passage actually says.',
	'',
	'Rules:',
	'- Only use requirement references from the list you are given. Never invent one.',
	'- Only use passage numbers from the passages you are given.',
	'- A passage may answer more than one requirement, or none. Most answer none.',
	'- Prefer saying nothing to guessing. A wrong pairing costs somebody their',
	'  attention, and there is no cost at all to leaving a passage unmapped.',
	'- confidence is 0-100, and is your own estimate of how plainly the passage',
	'  speaks to that requirement.',
	'',
	'Return JSON only: {"pairs": [{"passage": <number>, "requirement": "<ref>", "confidence": <0-100>}]}'
].join('\n');

/**
 * The response schema, validated before anything is written.
 *
 * Structured output is declared to the provider *and* checked here, because a
 * provider that ignores the schema, a provider swapped for one that does not
 * support it, and a model that returns prose are all the same problem to a
 * caller: unparseable output is discarded and logged, never retried into
 * something usable (docs/04-security.md §5.2).
 */
export const MapDocumentResponse = v.object({
	pairs: v.array(
		v.object({
			passage: v.pipe(v.number(), v.integer(), v.minValue(1)),
			requirement: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
			confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(100))
		})
	)
});

export type MapDocumentResponse = v.InferOutput<typeof MapDocumentResponse>;

/** The JSON schema handed to providers that can enforce one. */
export const MAP_DOCUMENT_JSON_SCHEMA = {
	type: 'object',
	properties: {
		pairs: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					passage: { type: 'integer' },
					requirement: { type: 'string' },
					confidence: { type: 'integer' }
				},
				required: ['passage', 'requirement', 'confidence']
			}
		}
	},
	required: ['pairs']
} as const;

/**
 * How much of an answer this task will pay for.
 *
 * A batch of passages against a list of requirements produces a short list of
 * pairs; anything longer than this is a model that has misunderstood the
 * question, and paying for more of it does not make it right.
 */
export const MAP_DOCUMENT_MAX_OUTPUT_TOKENS = 2_048;

/**
 * The question, with the document's text quarantined inside a data block.
 *
 * The requirements go in the *instruction* half because they are ours; the
 * passages go in the data half because they are not. That separation is defence
 * in depth — the defence is that nothing this returns can write state — but
 * mixing them would be giving away a boundary for nothing.
 */
export function mapDocumentInput(input: {
	passages: { n: number; text: string }[];
	requirements: { ref: string; asks: string }[];
}): string {
	const requirements = input.requirements.map((item) => `${item.ref} — ${item.asks}`).join('\n');
	const passages = input.passages.map((item) => `[${item.n}] ${item.text}`).join('\n\n');

	return ['REQUIREMENTS:', requirements, '', 'PASSAGES:', asData(passages)].join('\n');
}
