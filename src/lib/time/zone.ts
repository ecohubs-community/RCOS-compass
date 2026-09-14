/**
 * Time zones: which ones exist, and which one a page, a job or an email uses.
 * `openspec/changes/local-time`, design.md "Which zone a page uses".
 *
 * Shared by the server and the browser (no server-only imports), because the
 * account page validates in both places and they must agree.
 */

const known = new Map<string, boolean>();

/**
 * An IANA zone the running runtime recognises. The runtime's own list is the
 * authority: it is what `Intl` will format with, so a zone accepted here can
 * never throw later.
 */
export function isTimeZone(value: unknown): value is string {
	if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
	const cached = known.get(value);
	if (cached !== undefined) return cached;
	let ok = true;
	try {
		new Intl.DateTimeFormat('en', { timeZone: value });
	} catch {
		ok = false;
	}
	known.set(value, ok);
	return ok;
}

/**
 * The zone a person sees times in: their own, else their community's, else UTC.
 * A stored zone the runtime no longer knows is skipped rather than trusted —
 * a runtime upgrade that drops a zone must not make every page throw.
 */
export function timeZoneFor(
	person: { timeZone?: string | null } | null | undefined,
	community?: { timezone?: string | null } | null
): string {
	if (isTimeZone(person?.timeZone)) return person.timeZone;
	if (isTimeZone(community?.timezone)) return community.timezone;
	return 'UTC';
}
