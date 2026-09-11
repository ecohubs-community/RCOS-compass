import * as v from 'valibot';
import { asData, SYSTEM_PREAMBLE } from './system.js';

/**
 * Two things a thread can be asked for: what was said, and what a rule made of
 * it would look like.
 *
 * One prompt rather than two because they read the same input and differ only in
 * what they are for — and because a community that asks for a summary and then
 * asks for a draft should not pay twice for the model to read the same argument.
 *
 * **Neither output adopts anything.** The summary is a message somebody posts
 * after reading it; the draft lands in the proposal editor as text a person
 * edits and submits under their own name. `docs/00` §the-AI-rule: a model
 * drafts, structures, questions and maps — it never adopts.
 */

export const THREAD_PROMPT_VERSION = 1;

export const SUMMARISE_SYSTEM = [
	SYSTEM_PREAMBLE,
	'',
	'You are reading one discussion a community has been having, in order.',
	'',
	'Write a short summary of where the argument has got to. Say what people',
	'agree on, what they do not, and what question is still open. Name nobody —',
	'write about positions, not people, because a summary that says who said what',
	'reads as a scoreboard.',
	'',
	'Four sentences at the outside. If the thread has not said much, say that',
	'rather than padding it.',
	'',
	'Return JSON only:',
	'{"summary": "<the summary>"}'
].join('\n');

export const DRAFT_SYSTEM = [
	SYSTEM_PREAMBLE,
	'',
	'You are reading one discussion a community has been having, in order, and',
	'writing the rule it seems to be reaching for.',
	'',
	'Write it as the text a decision would adopt — the words that would go in',
	'their governance document, not a description of them. Say who is bound, how',
	'the thing happens, and what follows if it does not. Use the community’s own',
	'words where the thread has settled on them.',
	'',
	'Where the thread has not settled something, leave it visibly open rather',
	'than inventing an answer: write "[the assembly still has to decide X]" so',
	'the person editing it can see what is missing. Never invent a number, a',
	'deadline or a role nobody proposed.',
	'',
	'Short. A paragraph, not a constitution.',
	'',
	'Return JSON only:',
	'{"draft": "<the proposal text>"}'
].join('\n');

export const SummariseResponse = v.object({
	summary: v.pipe(v.string(), v.maxLength(1200))
});
export type SummariseResponse = v.InferOutput<typeof SummariseResponse>;

export const DraftResponse = v.object({
	draft: v.pipe(v.string(), v.maxLength(2000))
});
export type DraftResponse = v.InferOutput<typeof DraftResponse>;

export const SUMMARISE_JSON_SCHEMA = {
	type: 'object',
	properties: { summary: { type: 'string' } },
	required: ['summary']
} as const;

export const DRAFT_JSON_SCHEMA = {
	type: 'object',
	properties: { draft: { type: 'string' } },
	required: ['draft']
} as const;

/** A summary is four sentences; a draft is a paragraph. Neither is an essay. */
export const THREAD_MAX_OUTPUT_TOKENS = 768;

/**
 * The thread as data, oldest first.
 *
 * Authors are deliberately not sent. The model is asked about positions rather
 * than people, and a name in the input is a name that can come back out in the
 * output — which is both a privacy leak and the scoreboard the prompt forbids.
 */
export function threadInput(posts: { kind: string; body: string }[]): string {
	const LABEL: Record<string, string> = {
		message: 'Someone said',
		proposal: 'A proposal was written',
		offline_summary: 'A meeting was written up'
	};
	return asData(
		posts.map((post) => `${LABEL[post.kind] ?? 'Someone said'}:\n${post.body}`).join('\n\n')
	);
}
