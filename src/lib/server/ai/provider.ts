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
 *    definition, a confirmed mapping, or a decision. What enforces it is the
 *    module boundary in `eslint.config.js`: nothing here may import a service
 *    that writes, and the only schema this directory may touch is `schema/ai`.
 *
 * ## Unavailable is a result, not an exception
 *
 * This changed in P4, and deliberately. The first version of this seam rejected
 * with `AiUnavailableError`, which was right when the only way to be unavailable
 * was "no provider configured" — a boot-time fact, and genuinely exceptional.
 *
 * P4 adds budgets (docs/04-security.md §5.3), and a member reaching their daily
 * allowance is **ordinary operation**. It happens to the most engaged person in
 * the community, in the middle of the afternoon, and what they should see is a
 * sentence explaining that mapping still works by hand. Modelled as a throw, a
 * forgotten `catch` turns that routine afternoon into a 500. Modelled as a
 * result, the type makes the case impossible to skip, and the three ways to be
 * unavailable — no provider, provider failed, budget spent — collapse into the
 * one shape every caller already has to handle.
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

export type AiResult =
	| { ok: true; text: string; usage: AiUsage; model: string }
	/**
	 * `retryable` separates a provider hiccup from a budget that will not refill
	 * until tomorrow. The screen says different things about them, and neither is
	 * an error.
	 */
	| { ok: false; reason: string; retryable: boolean; usage: AiUsage; model: string };

export interface AiProvider {
	readonly id: string;
	complete(request: AiRequest): Promise<AiResult>;
}

/** The sentence a member sees when nothing is configured. */
export const NO_PROVIDER =
	'AI assistance is not switched on for this community. Everything still works without it — mapping and linting can be done by hand.';

export const unavailable = (
	reason: string,
	options: { retryable?: boolean; model?: string } = {}
): AiResult => ({
	ok: false,
	reason,
	retryable: options.retryable ?? false,
	usage: { in: 0, out: 0 },
	model: options.model ?? 'none'
});
