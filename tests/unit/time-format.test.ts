import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
	formatCalendarDate,
	formatMoment,
	formatRelative,
	isoDateIn,
	localMidnight
} from '../../src/lib/time/format.js';

/**
 * Moments as a person reads them. `openspec/changes/local-time`, the
 * `time-display` spec.
 */
const SUMMER = Date.UTC(2026, 6, 1, 16, 0); // 16:00 UTC, 1 July 2026

describe('a moment', () => {
	it('reads in the viewer’s zone', () => {
		expect(formatMoment(SUMMER, { timeZone: 'Europe/Lisbon', locale: 'en' }, 'time')).toBe('17:00');
		expect(formatMoment(SUMMER, { timeZone: 'America/New_York', locale: 'en' }, 'time')).toBe(
			'12:00'
		);
	});

	it('reads the same whatever zone the process runs in', () => {
		const script = `
			import { formatMoment } from './src/lib/time/format.ts';
			console.log(formatMoment(${SUMMER}, { timeZone: 'Europe/Lisbon', locale: 'en' }, 'dateTime'));
		`;
		const run = (tz: string) =>
			execFileSync(
				process.execPath,
				['--experimental-strip-types', '--input-type=module', '-e', script],
				{
					// The child process's zone is the thing under test, not application config.
					// eslint-disable-next-line no-restricted-properties
					env: { ...process.env, TZ: tz },
					cwd: join(import.meta.dirname, '../..'),
					stdio: ['ignore', 'pipe', 'ignore']
				}
			)
				.toString()
				.trim();
		const utc = run('UTC');
		expect(utc).toContain('17:00');
		expect(run('Pacific/Kiritimati')).toBe(utc);
	});

	it('is written in the page’s language', () => {
		expect(formatMoment(SUMMER, { timeZone: 'UTC', locale: 'de' }, 'dateLong')).toBe(
			'1. Juli 2026'
		);
		expect(formatMoment(SUMMER, { timeZone: 'UTC', locale: 'es' }, 'dateLong')).toBe(
			'1 de julio de 2026'
		);
	});

	it('names its zone when it is a deadline', () => {
		expect(formatMoment(SUMMER, { timeZone: 'Europe/Lisbon', locale: 'en' }, 'deadline')).toMatch(
			/17:00.*(WEST|GMT\+1)/
		);
	});

	it('says how long ago, from the time the caller gives', () => {
		expect(formatRelative(SUMMER - 2 * 3_600_000, SUMMER, 'en')).toBe('2 hours ago');
		expect(formatRelative(SUMMER, SUMMER, 'en')).toBe('now');
	});
});

describe('a calendar date', () => {
	it('is the same date for a viewer at UTC−10 and at UTC+14', () => {
		const firstOfMarch = localMidnight('2026-03-01', 'Europe/Lisbon')!;
		// Shown in the community's zone, not the viewer's, so both read 1 March.
		expect(formatCalendarDate(firstOfMarch, { timeZone: 'Europe/Lisbon', locale: 'en' })).toBe(
			'1 Mar 2026'
		);
		// …which the viewer's zone would get wrong, the thing rule 2 exists for.
		expect(formatMoment(firstOfMarch, { timeZone: 'Pacific/Honolulu', locale: 'en' })).toBe(
			'28 Feb 2026'
		);
	});

	it('starts at local midnight, including on the days the clocks change', () => {
		const at = (iso: string, zone: string) =>
			formatMoment(localMidnight(iso, zone)!, { timeZone: zone, locale: 'en' }, 'dateTime');
		expect(at('2026-06-15', 'Europe/Lisbon')).toBe('15 Jun 2026, 00:00');
		expect(at('2026-03-29', 'Europe/Lisbon')).toBe('29 Mar 2026, 00:00');
		expect(at('2026-10-25', 'Europe/Lisbon')).toBe('25 Oct 2026, 00:00');
		expect(at('2026-03-08', 'America/Los_Angeles')).toBe('8 Mar 2026, 00:00');
		expect(at('2026-01-01', 'Pacific/Kiritimati')).toBe('1 Jan 2026, 00:00');
		expect(localMidnight('2026-02-30', 'UTC')).toBeNull();
		expect(localMidnight('1 March', 'UTC')).toBeNull();
	});
});

describe('an archival date', () => {
	it('is the day on the community’s calendar, not UTC’s', () => {
		const lateInHonolulu = Date.UTC(2026, 2, 2, 8, 30); // 22:30 on 1 March in Honolulu
		expect(isoDateIn(lateInHonolulu, 'Pacific/Honolulu')).toBe('2026-03-01');
		expect(isoDateIn(lateInHonolulu, 'UTC')).toBe('2026-03-02');
	});
});

describe('no screen formats a date on its own', () => {
	/**
	 * `toLocaleDateString` and friends without an explicit zone format in the
	 * server's zone during rendering and the browser's after hydration. Only
	 * `$lib/time/format.ts` may turn a moment into text.
	 */
	const ROOT = join(import.meta.dirname, '../../src');
	const files: string[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			if (name === 'paraglide') continue;
			if (statSync(path).isDirectory()) walk(path);
			else if (/\.(ts|svelte)$/.test(name)) files.push(path);
		}
	};
	walk(ROOT);

	it('finds files to check', () => {
		expect(files.length).toBeGreaterThan(100);
	});

	it('leaves Intl date formatting to the one module', () => {
		const offenders = files
			.filter((file) => {
				const source = readFileSync(file, 'utf8');
				return (
					/\.toLocaleDateString\(|\.toLocaleTimeString\(|new Date\([^)]*\)\.toLocaleString\(/.test(
						source
					) && !file.endsWith(join('lib', 'time', 'format.ts'))
				);
			})
			.map((file) => relative(ROOT, file));
		expect(offenders).toEqual([]);
	});
});
