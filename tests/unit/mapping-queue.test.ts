import { describe, expect, it } from 'vitest';
import { currentSuggestion } from '../../src/lib/components/documents/queue.js';

/** The phone queue's order: one open suggestion at a time. Design 16b. */
const card = (evidenceId: string, passageId: string, state = 'suggested') => ({
	evidenceId,
	passageId,
	state
});

describe('the mapping queue', () => {
	it('presents a passage with two open suggestions once per suggestion', () => {
		const cards = [card('a1', 'p1'), card('a2', 'p1'), card('b1', 'p2')];
		expect(currentSuggestion(cards, 'p1')?.evidenceId).toBe('a1');

		// Answering the first leaves the second in the queue, on the same passage.
		const answered = [card('a1', 'p1', 'confirmed'), card('a2', 'p1'), card('b1', 'p2')];
		expect(currentSuggestion(answered, 'p1')?.evidenceId).toBe('a2');
		expect(currentSuggestion(answered, null)?.evidenceId).toBe('a2');
	});

	it('moves on to the first open suggestion when the passage asked for has none', () => {
		const cards = [card('a1', 'p1', 'dismissed'), card('b1', 'p2')];
		expect(currentSuggestion(cards, 'p1')?.evidenceId).toBe('b1');
	});

	it('has nothing to show when nothing is open', () => {
		expect(currentSuggestion([card('a1', 'p1', 'confirmed')], 'p1')).toBeNull();
	});
});
