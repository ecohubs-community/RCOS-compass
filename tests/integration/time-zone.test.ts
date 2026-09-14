import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { user } from '../../src/lib/server/db/schema/auth.js';
import {
	detectPersonTimeZone,
	setPersonTimeZone,
	timeZoneChoices
} from '../../src/lib/server/services/time-zone.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeUser } from '../support/factories.js';

/**
 * A person's time zone: detected once, chosen after that.
 * `openspec/changes/local-time`, the `time-display` spec.
 */
const NOW = Date.UTC(2026, 8, 14, 12, 0);

let db: Db;
let cleanup: () => void;
let ana: ReturnType<typeof makeUser>;
let lena: ReturnType<typeof makeUser>;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	ana = makeUser(db, { email: 'ana@example.org' });
	lena = makeUser(db, { email: 'lena@example.org' });
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const zoneOf = (id: string) => db.select().from(user).where(eq(user.id, id)).get()!.timeZone;

describe('detecting a zone', () => {
	it('sets a zone nobody has set', () => {
		expect(detectPersonTimeZone(db, ana.id, 'Europe/Lisbon', NOW)).toBe(true);
		expect(zoneOf(ana.id)).toBe('Europe/Lisbon');
	});

	it('never replaces a zone already set — travelling changes nothing', () => {
		setPersonTimeZone(db, ana.id, 'Europe/Lisbon', NOW);
		expect(detectPersonTimeZone(db, ana.id, 'Asia/Tokyo', NOW)).toBe(false);
		expect(zoneOf(ana.id)).toBe('Europe/Lisbon');
	});

	it('ignores a zone the runtime does not know', () => {
		expect(detectPersonTimeZone(db, ana.id, 'Mars/Olympus', NOW)).toBe(false);
		expect(zoneOf(ana.id)).toBeNull();
	});
});

describe('choosing a zone', () => {
	it('changes only the person named', () => {
		setPersonTimeZone(db, ana.id, 'America/New_York', NOW);
		expect(zoneOf(ana.id)).toBe('America/New_York');
		expect(zoneOf(lena.id)).toBeNull();
	});

	it('refuses a made-up zone and keeps the stored one', () => {
		setPersonTimeZone(db, ana.id, 'Europe/Lisbon', NOW);
		expect(catchRefusal(() => setPersonTimeZone(db, ana.id, 'Mars/Olympus', NOW))).toEqual({
			status: 400,
			message: 'Choose a time zone from the list.'
		});
		expect(zoneOf(ana.id)).toBe('Europe/Lisbon');
	});

	it('offers every zone the runtime knows, grouped, with UTC', () => {
		const choices = timeZoneChoices();
		const all = choices.flatMap((group) => group.zones);
		expect(all).toContain('UTC');
		expect(all).toContain('Europe/Lisbon');
		expect(choices.find((group) => group.region === 'Europe')!.zones).toContain('Europe/Berlin');
	});
});
