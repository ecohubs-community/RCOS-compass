import { AiUnavailableError, type AiProvider, type AiRequest, type AiResult } from './provider.js';

/**
 * Replays recorded responses. docs/06-testing-strategy.md §8: no test calls a real
 * provider, and re-recording a fixture is a deliberate, reviewed act.
 */
export type Fixtures = Partial<Record<AiRequest['task'], AiResult>>;

export function fixtureProvider(fixtures: Fixtures): AiProvider {
	return {
		id: 'fixture',
		available: true,
		complete(request) {
			const fixture = fixtures[request.task];
			if (!fixture) {
				return Promise.reject(
					new AiUnavailableError(
						`No fixture recorded for AI task "${request.task}". ` +
							'Add one under tests/fixtures/ai/ rather than calling a live provider.'
					)
				);
			}
			return Promise.resolve(fixture);
		}
	};
}
