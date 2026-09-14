import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isTimeZone, timeZoneFor } from '../../src/lib/time/zone.js';

/**
 * Which time zone a person reads times in, and the storage rule behind it.
 * `openspec/changes/local-time`, the `time-display` spec.
 */
describe('a time zone', () => {
	it('is one the runtime knows', () => {
		expect(isTimeZone('Europe/Lisbon')).toBe(true);
		expect(isTimeZone('UTC')).toBe(true);
		expect(isTimeZone('Mars/Olympus')).toBe(false);
		expect(isTimeZone('')).toBe(false);
		expect(isTimeZone(null)).toBe(false);
		expect(isTimeZone('x'.repeat(200))).toBe(false);
	});

	it('is the person’s, else the community’s, else UTC', () => {
		expect(timeZoneFor({ timeZone: 'Asia/Tokyo' }, { timezone: 'Europe/Berlin' })).toBe(
			'Asia/Tokyo'
		);
		expect(timeZoneFor({ timeZone: null }, { timezone: 'Europe/Berlin' })).toBe('Europe/Berlin');
		expect(timeZoneFor(null, null)).toBe('UTC');
	});

	it('skips a stored zone the runtime no longer knows, rather than throwing later', () => {
		expect(timeZoneFor({ timeZone: 'Mars/Olympus' }, { timezone: 'Europe/Berlin' })).toBe(
			'Europe/Berlin'
		);
	});
});

describe('every stored moment is a UTC instant', () => {
	/**
	 * A column named for a moment is an integer of epoch milliseconds, never a
	 * string: a string date carries an implied zone, and implied zones are how
	 * "1 March" becomes 28 February for somebody west of Greenwich.
	 */
	const DIR = join(import.meta.dirname, '../../src/lib/server/db/schema');
	const source = readdirSync(DIR)
		.filter((file) => file.endsWith('.ts'))
		.map((file) => readFileSync(join(DIR, file), 'utf8'))
		.join('\n');

	it('finds moment columns at all', () => {
		expect(
			source.match(/integer\('[a-z_]+_at', \{ mode: 'timestamp_ms' \}\)/g)?.length
		).toBeGreaterThan(20);
	});

	it('has no text column named for a moment', () => {
		expect(source.match(/text\('[a-z_]*(_at|_on|_date|date_[a-z]+)'/g) ?? []).toEqual([]);
	});

	it('stores every *_at column as epoch milliseconds', () => {
		const moments = source.match(/\('[a-z_]+_at'[^)]*\)/g) ?? [];
		const loose = moments.filter((column) => !column.includes("mode: 'timestamp_ms'"));
		expect(loose).toEqual([]);
	});
});
