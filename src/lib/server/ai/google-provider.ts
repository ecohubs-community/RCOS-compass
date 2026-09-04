import { unavailable, type AiProvider, type AiRequest, type AiResult } from './provider.js';

/**
 * Google AI Studio, over `fetch`.
 *
 * No SDK. The seam's whole promise is that adding a provider is one file
 * (docs/00-architecture.md §4), and a vendor SDK brings a dependency tree, its
 * own retry and telemetry behaviour, and a shape the next adapter would have to
 * imitate. This is one POST and a response to read.
 *
 * The system prompt and the data block are sent as separate parts. That is
 * defence in depth rather than the defence — the real one is that nothing this
 * returns can write state — but sending untrusted text in the same string as
 * the instructions would be giving away a boundary for nothing.
 */
export function googleProvider(options: {
	apiKey: string;
	model: string;
	baseUrl?: string;
	timeoutMs?: number;
}): AiProvider {
	const base = (options.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');

	return {
		id: 'google',
		async complete(request: AiRequest): Promise<AiResult> {
			const url = `${base}/v1beta/models/${encodeURIComponent(options.model)}:generateContent`;
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);

			try {
				const response = await fetch(url, {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
						// A header, never a query parameter: a URL ends up in logs and
						// proxies, and a key in one of those is a key that has leaked.
						'x-goog-api-key': options.apiKey
					},
					body: JSON.stringify({
						systemInstruction: { parts: [{ text: request.system }] },
						contents: [{ role: 'user', parts: [{ text: request.input }] }],
						generationConfig: {
							maxOutputTokens: request.maxOutputTokens,
							// Governance work wants the same answer twice, not a creative one.
							temperature: 0,
							...(request.json
								? { responseMimeType: 'application/json', responseSchema: request.json }
								: {})
						}
					}),
					signal: controller.signal
				});

				if (!response.ok) {
					// 429 and 5xx are worth trying again; a 400 means we sent something
					// wrong and will send it wrong again.
					const retryable = response.status === 429 || response.status >= 500;
					return unavailable(
						`The AI provider answered ${response.status}. ${
							retryable ? 'It may work shortly.' : 'Mapping and linting still work by hand.'
						}`,
						{ retryable, model: options.model }
					);
				}

				const body = (await response.json()) as {
					candidates?: { content?: { parts?: { text?: string }[] } }[];
					usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
				};

				const text = (body.candidates?.[0]?.content?.parts ?? [])
					.map((part) => part.text ?? '')
					.join('');
				const usage = {
					in: body.usageMetadata?.promptTokenCount ?? 0,
					out: body.usageMetadata?.candidatesTokenCount ?? 0
				};

				if (!text) {
					// An empty candidate is usually a safety block or a truncation. The
					// tokens were still spent, so they are still reported.
					return {
						ok: false,
						reason: 'The AI provider returned nothing usable for this request.',
						retryable: false,
						usage,
						model: options.model
					};
				}

				return { ok: true, text, usage, model: options.model };
			} catch (problem) {
				const aborted = (problem as Error).name === 'AbortError';
				return unavailable(
					aborted
						? 'The AI provider did not answer in time.'
						: 'The AI provider could not be reached.',
					{ retryable: true, model: options.model }
				);
			} finally {
				clearTimeout(timer);
			}
		}
	};
}
