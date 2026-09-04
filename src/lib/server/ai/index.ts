import { getConfig } from '../config.js';
import { fixtureProvider } from './fixture-provider.js';
import { googleProvider } from './google-provider.js';
import { nullProvider } from './null-provider.js';
import type { AiProvider } from './provider.js';

export * from './provider.js';
export { nullProvider } from './null-provider.js';
export { googleProvider } from './google-provider.js';
export { fixtureProvider, type Fixtures } from './fixture-provider.js';

let override: AiProvider | null = null;

/** Test seam. Application code never calls this. */
export function setAiProviderForTests(provider: AiProvider | null): void {
	override = provider;
}

/**
 * Selected by configuration, never by an import.
 *
 * `openai-compatible` resolves to the Google adapter's shape only when someone
 * writes that adapter; until then it is `null`, which is the honest answer for
 * a provider that does not exist rather than a silent fallback to a different
 * vendor's endpoint.
 */
export function getAiProvider(): AiProvider {
	if (override) return override;

	const config = getConfig();
	switch (config.AI_PROVIDER) {
		case 'fixture':
			return fixtureProvider({});
		case 'google':
			// The config layer already refused to boot without these.
			return googleProvider({ apiKey: config.AI_API_KEY, model: config.AI_MODEL });
		case 'openai-compatible':
		case 'null':
		default:
			return nullProvider;
	}
}
