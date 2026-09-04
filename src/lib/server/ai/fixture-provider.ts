import { unavailable, type AiProvider, type AiRequest, type AiResult } from './provider.js';

/**
 * Replays recorded responses. docs/06-testing-strategy.md §8: no test calls a real
 * provider, and re-recording a fixture is a deliberate, reviewed act.
 */
export type Fixtures = Partial<Record<AiRequest['task'], AiResult>>;

export function fixtureProvider(fixtures: Fixtures): AiProvider {
	return {
		id: 'fixture',
		complete(request) {
			const fixture = fixtures[request.task];
			if (!fixture) {
				// Not `retryable`: running it again replays the same absence. A
				// missing fixture is a message to whoever is writing the test, not
				// something a member should ever meet.
				return Promise.resolve(
					unavailable(
						`No fixture recorded for AI task "${request.task}". ` +
							'Add one under tests/fixtures/ai/ rather than calling a live provider.',
						{ model: 'fixture' }
					)
				);
			}
			return Promise.resolve(fixture);
		}
	};
}
