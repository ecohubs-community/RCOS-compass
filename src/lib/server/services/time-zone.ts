import { and, eq, isNull } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { Db } from '../db/index.js';
import { user } from '../db/schema/auth.js';
import { isTimeZone } from '../../time/zone.js';

/**
 * A person's time zone. `openspec/changes/local-time`, the `time-display` spec.
 *
 * Belongs to the person, not to a community, so it takes a user id rather than
 * a `Ctx` — the account page that calls it sits outside every community, like
 * erasure. It only ever changes the signed-in person's own row: the caller
 * passes `locals.user.id`, never an id from a form.
 */

/**
 * Set the zone the person chose. Refused with a sentence when the runtime does
 * not know the zone, so a hand-built request cannot store something every page
 * would then have to fall back from.
 */
export function setPersonTimeZone(db: Db, userId: string, zone: string, now: number): void {
	if (!isTimeZone(zone)) error(400, 'Choose a time zone from the list.');
	db.update(user)
		.set({ timeZone: zone, updatedAt: new Date(now) })
		.where(eq(user.id, userId))
		.run();
}

/**
 * The browser's report, taken only when nothing is set. A zone a person chose
 * — or one detected earlier — is never replaced by where their laptop happens
 * to be today. Answers whether anything changed; an unknown zone changes
 * nothing and is not an error, because nobody chose it.
 */
export function detectPersonTimeZone(db: Db, userId: string, zone: string, now: number): boolean {
	if (!isTimeZone(zone)) return false;
	return (
		db
			.update(user)
			.set({ timeZone: zone, updatedAt: new Date(now) })
			.where(and(eq(user.id, userId), isNull(user.timeZone)))
			.run().changes > 0
	);
}

/** Every zone the runtime knows, grouped by region, for the account page's select. */
export function timeZoneChoices(): { region: string; zones: string[] }[] {
	const zones = [...new Set(['UTC', ...Intl.supportedValuesOf('timeZone')])];
	const regions = new Map<string, string[]>();
	for (const zone of zones) {
		const region = zone.includes('/') ? zone.split('/')[0]! : 'Other';
		regions.set(region, [...(regions.get(region) ?? []), zone]);
	}
	return [...regions].map(([region, list]) => ({ region, zones: list.sort() }));
}
