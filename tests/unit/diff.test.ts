import { describe, expect, it } from 'vitest';
import { diffWords } from '../../src/lib/shared/diff.js';

/**
 * The comparison behind "Compare v2 → v3".
 *
 * What matters is that it never *loses* text: a reader deciding whether a
 * revision changed what they agreed to is the one person who must not be shown
 * a word that is not there, or be denied one that is.
 */
describe('comparing two versions of a proposal', () => {
	const rebuild = (parts: ReturnType<typeof diffWords>, side: 'before' | 'after') =>
		parts
			.filter(
				(part) => part.kind === 'same' || part.kind === (side === 'before' ? 'removed' : 'added')
			)
			.map((part) => part.text)
			.join('');

	it('marks only what changed', () => {
		const parts = diffWords(
			'Within three months the treasurer settles.',
			'Within two months the treasurer settles.'
		);

		expect(parts.filter((p) => p.kind === 'removed').map((p) => p.text.trim())).toEqual(['three']);
		expect(parts.filter((p) => p.kind === 'added').map((p) => p.text.trim())).toEqual(['two']);
	});

	it('reconstructs both texts exactly', () => {
		const before = 'A member may leave at any time by telling the assembly in writing.';
		const after =
			'A member may leave at any time by telling a steward in writing, and their share is settled.';
		const parts = diffWords(before, after);

		expect(rebuild(parts, 'before').trim()).toBe(before);
		expect(rebuild(parts, 'after').trim()).toBe(after);
	});

	it('says nothing changed when nothing did', () => {
		const parts = diffWords('The same words.', 'The same words.');
		expect(parts.every((part) => part.kind === 'same')).toBe(true);
	});

	it('handles a version written from nothing', () => {
		expect(diffWords('', 'All new.').every((part) => part.kind === 'added')).toBe(true);
		expect(diffWords('All gone.', '').every((part) => part.kind === 'removed')).toBe(true);
	});

	it('merges a changed phrase into one run rather than one box per word', () => {
		const parts = diffWords('settled within thirty days', 'settled within three calendar months');
		expect(parts.filter((part) => part.kind === 'added')).toHaveLength(1);
	});
});
