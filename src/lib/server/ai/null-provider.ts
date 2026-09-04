import { NO_PROVIDER, unavailable, type AiProvider } from './provider.js';

/**
 * The provider CI runs with, and the default for a new instance.
 *
 * A first-class option rather than a degraded mode: every AI feature must have
 * a manual path (docs/00-architecture.md §4 rule 3), and the way to keep that
 * true is for the no-provider case to be the one exercised on every commit.
 */
export const nullProvider: AiProvider = {
	id: 'null',
	complete() {
		return Promise.resolve(unavailable(NO_PROVIDER));
	}
};
