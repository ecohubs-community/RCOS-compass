import { describe, expect, it } from 'vitest';
import { definitionStatus, type StatusFacts } from '../../src/lib/shared/definition-status.js';
import { STATUS_LABELS } from '../../src/lib/components/ui/StatusChip.svelte';

const NOW = Date.UTC(2026, 9, 1);
const DAY = 86_400_000;
const none: StatusFacts = {
	exists: false,
	adopted: false,
	openDiscussion: false,
	openRound: false,
	reviewDueAt: null
};

describe('definitionStatus', () => {
	it.each([
		['nothing at all', {}, 'not_started'],
		['a draft and nothing else', { exists: true }, 'drafting'],
		['a discussion before any draft exists', { openDiscussion: true }, 'in_discussion'],
		['a draft and a discussion', { exists: true, openDiscussion: true }, 'in_discussion'],
		['an open round', { exists: true, openDiscussion: true, openRound: true }, 'in_vote'],
		['adopted', { exists: true, adopted: true }, 'adopted'],
		[
			'adopted, review in the future',
			{ exists: true, adopted: true, reviewDueAt: NOW + DAY },
			'adopted'
		],
		[
			'adopted, review passed',
			{ exists: true, adopted: true, reviewDueAt: NOW - DAY },
			'needs_review'
		]
	] as const)('%s → %s', (_, facts, expected) => {
		expect(definitionStatus({ ...none, ...facts }, NOW).status).toBe(expected);
	});

	it('keeps an adopted definition adopted while a change is argued, and says so', () => {
		const argued = definitionStatus(
			{ ...none, exists: true, adopted: true, openDiscussion: true },
			NOW
		);
		expect(argued).toEqual({ status: 'adopted', rediscussed: true });
		const voted = definitionStatus({ ...none, exists: true, adopted: true, openRound: true }, NOW);
		expect(voted).toEqual({ status: 'adopted', rediscussed: true });
	});

	it('is due for review exactly when the date has passed, not on it', () => {
		expect(
			definitionStatus({ ...none, adopted: true, exists: true, reviewDueAt: NOW }, NOW).status
		).toBe('adopted');
	});

	it('only ever returns a status the chip can draw', () => {
		const facts: StatusFacts[] = [];
		for (const exists of [false, true])
			for (const adopted of [false, true])
				for (const openDiscussion of [false, true])
					for (const openRound of [false, true])
						for (const reviewDueAt of [null, NOW - DAY, NOW + DAY])
							facts.push({ exists, adopted, openDiscussion, openRound, reviewDueAt });
		for (const f of facts) expect(STATUS_LABELS).toHaveProperty(definitionStatus(f, NOW).status);
	});
});
