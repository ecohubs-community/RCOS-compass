import { AiUnavailableError, type AiProvider, type AiRequest } from './provider.js';

/**
 * The provider CI runs with, and the default for a new instance.
 *
 * Every AI feature must degrade to a manual path (docs/00-architecture.md §4), so
 * this refuses loudly rather than returning an empty result that a caller might
 * mistake for an answer.
 */
export const nullProvider: AiProvider = {
	id: 'null',
	available: false,
	complete(request: AiRequest) {
		return Promise.reject(
			new AiUnavailableError(
				`AI is disabled on this instance, so "${request.task}" cannot run. ` +
					'The manual path does the same job.'
			)
		);
	}
};
