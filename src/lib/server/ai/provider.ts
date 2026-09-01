/**
 * The AI seam. docs/00-architecture.md §4.
 *
 * Two rules the type system helps with, and one it cannot:
 *  - the provider is selected by configuration, never by an import, so swapping
 *    Google AI Studio for an EU endpoint or a local model is a `.env` change;
 *  - `input` is ALWAYS untrusted data. Uploaded documents reach a model through
 *    it, and a document can contain instructions (docs/04-security.md §5);
 *  - the rule no type can enforce: **an AI response may only produce a suggestion
 *    a human confirms.** There is no code path from a result to an adopted
 *    definition, a confirmed mapping, or a decision.
 */
export type AiTask = 'map-document' | 'lint-definition' | 'plain-language' | 'summarise-thread';

export type AiRequest = {
	task: AiTask;
	system: string;
	/** Untrusted. Delimited as data by the prompt; never concatenated as instructions. */
	input: string;
	/** Response schema when structured output is required. */
	json?: object;
	maxOutputTokens: number;
};

export type AiUsage = { in: number; out: number };

export type AiResult = {
	text: string;
	parsed?: unknown;
	usage: AiUsage;
	model: string;
};

export interface AiProvider {
	readonly id: string;
	readonly available: boolean;
	complete(request: AiRequest): Promise<AiResult>;
}

export class AiUnavailableError extends Error {
	constructor(reason: string) {
		super(reason);
		this.name = 'AiUnavailableError';
	}
}
