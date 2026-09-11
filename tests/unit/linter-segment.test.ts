import { describe, expect, it } from 'vitest';
import { segmentLines } from '../../src/lib/server/linter/segment.js';

/**
 * Where a line ends.
 *
 * The linter judges each line against its own job, so a split in the wrong place
 * puts a finding on a sentence nobody wrote. The cases that matter are the ones
 * governance prose is full of: clause references, abbreviations and amounts.
 */
describe('splitting a body into lines', () => {
	it('splits a paragraph into its sentences', () => {
		expect(
			segmentLines(
				'A member may leave at any time. Within three months the treasurer settles what is owed.'
			)
		).toEqual([
			'A member may leave at any time.',
			'Within three months the treasurer settles what is owed.'
		]);
	});

	it('does not split on a clause reference, an abbreviation or a decimal', () => {
		// All three appear constantly in the standard's own text, and a regex
		// splitter breaks every one of them.
		expect(
			segmentLines('Under §3.6 the assembly decides, e.g. by consent, within 1.5 months.')
		).toHaveLength(1);
	});

	it('splits a list into its items', () => {
		const lines = segmentLines(
			'The settlement covers:\n- the capital share\n- outstanding contribution hours\n- community objects held privately'
		);
		expect(lines).toEqual([
			'The settlement covers:',
			'- the capital share',
			'- outstanding contribution hours',
			'- community objects held privately'
		]);
	});

	it('keeps a numbered item whole even though it is not a sentence', () => {
		const lines = segmentLines('Grounds for removal:\n1. non-payment\n2. sustained absence');
		expect(lines).toEqual(['Grounds for removal:', '1. non-payment', '2. sustained absence']);
	});

	it('separates paragraphs', () => {
		expect(segmentLines('First rule.\n\nSecond rule.')).toEqual(['First rule.', 'Second rule.']);
	});

	it('splits German without splitting z.B.', () => {
		const lines = segmentLines(
			'Ein Mitglied kann jederzeit gehen. Innerhalb von 3 Monaten regelt z.B. der Kassierer alles.',
			'de'
		);
		expect(lines).toHaveLength(2);
		expect(lines[1]).toContain('z.B.');
	});

	it('falls back to a known locale rather than throwing on an unknown one', () => {
		expect(segmentLines('One sentence here.', 'not-a-locale')).toEqual(['One sentence here.']);
	});

	it('yields nothing for an empty body', () => {
		expect(segmentLines('')).toEqual([]);
		expect(segmentLines('   \n\n  ')).toEqual([]);
	});
});
