import { describe, expect, it } from 'vitest';
import { findExcerpt } from '../../src/lib/shared/excerpt.js';
import { joinsAcrossHyphen } from '../../src/lib/shared/hyphenation.js';

/**
 * Words a member selected, found in the passage text they were selected from.
 * `pdf-selection-mapping`, "A selection maps to the words the member selected".
 */

const slice = (text: string, found: { start: number; end: number } | null) =>
	found ? text.slice(found.start, found.end) : null;

describe('the hyphen rule the extractor and the matcher share', () => {
	it('joins a word split before a lowercase letter', () => {
		expect(joinsAcrossHyphen('the housekeeping commit-', 'tee, and')).toBe(true);
	});

	it('keeps a hyphen before a capital, a digit or after a non-letter', () => {
		expect(joinsAcrossHyphen('Valle-', 'Verde')).toBe(false);
		expect(joinsAcrossHyphen('pages 3-', '5')).toBe(false);
		expect(joinsAcrossHyphen('2024 -', 'the')).toBe(false);
	});
});

describe('finding the selected words in a passage', () => {
	const text =
		'Quiet hours are agreed each season by the housekeeping committee, and posted on the board beside the kitchen.';

	it('finds words exactly as stored', () => {
		expect(slice(text, findExcerpt(text, 'posted on the board'))).toBe('posted on the board');
	});

	it('ignores a line break the page drew where the text has a space', () => {
		expect(slice(text, findExcerpt(text, 'each season\nby the'))).toBe('each season by the');
	});

	it('ignores a missing space between two runs, and an extra one', () => {
		expect(slice(text, findExcerpt(text, 'eachseason'))).toBe('each season');
		expect(slice(text, findExcerpt(text, 'kit chen'))).toBe('kitchen');
	});

	it('finds a word the page shows hyphenated across a line, and returns it as stored', () => {
		expect(slice(text, findExcerpt(text, 'housekeeping commit-\ntee, and'))).toBe(
			'housekeeping committee, and'
		);
		// Some browsers drop the line break from the selection string entirely.
		expect(slice(text, findExcerpt(text, 'commit-tee'))).toBe('committee');
	});

	it('keeps a hyphen the text itself has', () => {
		const stored = 'A self-governing body, formed by the assembly.';
		expect(slice(stored, findExcerpt(stored, 'self-governing'))).toBe('self-governing');
	});

	it('does not invent a join the rule forbids', () => {
		const stored = 'Members of ValleVerde meet monthly.';
		expect(findExcerpt(stored, 'Valle-Verde')).toBeNull();
	});

	it('picks the occurrence nearest to where the selection began', () => {
		const twice =
			'The council decides who joins. Members meet monthly. In a dispute, the council decides last.';
		const first = twice.indexOf('the council decides');
		const second = twice.lastIndexOf('the council decides');

		expect(findExcerpt(twice, 'the council decides', second - 3)).toEqual({
			start: second,
			end: second + 'the council decides'.length
		});
		expect(findExcerpt(twice, 'the council decides', first + 2)?.start).toBe(first);
	});

	it('takes the first occurrence when it is not told where the selection began', () => {
		const twice = 'one two one two';
		expect(findExcerpt(twice, 'one two')).toEqual({ start: 0, end: 7 });
	});

	it('tells two occurrences on one line apart by how far along the line they are', () => {
		const line = 'yes or no, yes or no';
		expect(findExcerpt(line, 'yes or no', 12)).toEqual({ start: 11, end: 20 });
		expect(findExcerpt(line, 'yes or no', 1)).toEqual({ start: 0, end: 9 });
	});

	it('returns nothing for words the passage does not contain', () => {
		expect(findExcerpt(text, 'the garden shed')).toBeNull();
	});

	it('returns nothing for an empty or blank selection', () => {
		expect(findExcerpt(text, '')).toBeNull();
		expect(findExcerpt(text, ' \n\t')).toBeNull();
	});

	it('maps back to the stored indices when the text has runs of whitespace', () => {
		const spaced = 'One  line\n\nand   another.';
		expect(slice(spaced, findExcerpt(spaced, 'line and'))).toBe('line\n\nand');
	});
});
