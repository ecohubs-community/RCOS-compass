import { getConfig } from '../config.js';
import { fixtureProvider } from './fixture-provider.js';
import { nullProvider } from './null-provider.js';
import type { AiProvider } from './provider.js';

export * from './provider.js';
export { nullProvider } from './null-provider.js';
export { fixtureProvider, type Fixtures } from './fixture-provider.js';

let override: AiProvider | null = null;

/** Test seam. Application code never calls this. */
export function setAiProviderForTests(provider: AiProvider | null): void {
	override = provider;
}

/**
 * Selected by configuration, never by an import. The google and
 * openai-compatible adapters land in P4; until then they resolve to `null`,
 * which is the honest behaviour for a feature that does not exist yet.
 */
export function getAiProvider(): AiProvider {
	if (override) return override;

	switch (getConfig().AI_PROVIDER) {
		case 'fixture':
			return fixtureProvider({});
		case 'google':
		case 'openai-compatible':
		case 'null':
		default:
			return nullProvider;
	}
}
