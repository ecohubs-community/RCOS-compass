import { describe, expect, it } from 'vitest';
import { parseAddresses } from '../../src/lib/shared/addresses.js';

/** A steward's pasted list, read the way the invite form reads it. */
describe('parseAddresses', () => {
	it.each([
		['commas', 'ana@example.org, lena@example.org', ['ana@example.org', 'lena@example.org']],
		['new lines', 'ana@example.org\nlena@example.org', ['ana@example.org', 'lena@example.org']],
		['semicolons', 'ana@example.org;lena@example.org', ['ana@example.org', 'lena@example.org']],
		[
			'spaces and tabs',
			'ana@example.org \t lena@example.org',
			['ana@example.org', 'lena@example.org']
		],
		[
			'a mixture',
			'ana@example.org,\n\n lena@example.org ;',
			['ana@example.org', 'lena@example.org']
		]
	])('splits on %s', (_, text, expected) => {
		expect(parseAddresses(text).map((p) => p.address)).toEqual(expected);
	});

	it('lower-cases and keeps the same address once, in the order first written', () => {
		expect(
			parseAddresses('Lena@Example.org, ana@example.org, lena@example.ORG').map((p) => p.address)
		).toEqual(['lena@example.org', 'ana@example.org']);
	});

	it('takes the address out of "Name <address>" and drops a trailing full stop', () => {
		expect(parseAddresses('Lena Vogt <lena@example.org>, ana@example.org.')).toEqual([
			{ address: 'lena@example.org', valid: true },
			{ address: 'ana@example.org', valid: true }
		]);
	});

	it('marks what is not an address rather than dropping it, so the steward sees it', () => {
		expect(parseAddresses('marco, ana@example.org, @nope, x@y')).toEqual([
			{ address: 'marco', valid: false },
			{ address: 'ana@example.org', valid: true },
			{ address: '@nope', valid: false },
			{ address: 'x@y', valid: false }
		]);
	});

	it('reads an empty box as nothing', () => {
		expect(parseAddresses('  \n , ; ')).toEqual([]);
	});
});
