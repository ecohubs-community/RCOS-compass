import { error, redirect, type RequestEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getConfig, isPlatformAdmin } from '../config.js';
import { getDb } from '../db/index.js';
import { twoFactor, type User } from '../db/schema/auth.js';

/**
 * Platform admin access. docs/04-security.md §6, docs/05-admin-console.md §1.
 *
 * Three properties, each deliberate:
 *
 *  - identity comes from the environment, matched against a *verified* address
 *    at request time — never a database flag (a write could mint an admin) and
 *    never a session claim (removing an address would take until next sign-in);
 *  - a second factor is required, because this is the widest-reaching account on
 *    the instance;
 *  - refusal is 404, not 403: the console does not announce itself.
 */
export type AdminStatus = 'ok' | 'not_admin' | 'needs_two_factor';

export function adminStatus(user: User | null): AdminStatus {
	if (!user) return 'not_admin';
	if (!isPlatformAdmin(user.email, user.emailVerified, getConfig().adminEmails)) {
		return 'not_admin';
	}

	const enrolled = getDb().select().from(twoFactor).where(eq(twoFactor.userId, user.id)).get();

	if (!enrolled?.verified) return 'needs_two_factor';
	return 'ok';
}

/**
 * Where an admin without a second factor is sent: the Two-factor panel of the
 * console's own settings. Inside `/admin` because an admin may belong to no
 * community, and so has no other settings to find it in.
 */
export const ENROLMENT_PATH = '/admin/settings/two-factor';

/**
 * Guards an admin route. Called in `hooks.server.ts`, again in the admin
 * layout, and again in every action — three checks, because one of them will
 * eventually be edited by someone in a hurry.
 *
 * `pathname` lets the enrolment page itself through for an admin who has not
 * enrolled yet: without it, the redirect would point at a page that redirects.
 * Only that page, and only for somebody who is an admin — a stranger still gets
 * the same 404 there as anywhere else in the console.
 */
export function requirePlatformAdmin(user: User | null, pathname?: string): void {
	const status = adminStatus(user);
	// Not-an-admin and no-such-page are the same answer on purpose.
	if (status === 'not_admin') error(404, 'Not found');
	// A listed admin who has not enrolled is sent to enrolment rather than shown
	// a dead end: they are the right person, holding half of what they need. This
	// discloses nothing — they already know their own address is listed.
	if (status === 'needs_two_factor' && pathname !== ENROLMENT_PATH) {
		redirect(303, ENROLMENT_PATH);
	}
}

/**
 * The third check, for a page whose actions come from elsewhere — the shared
 * account panels. Each action is guarded before it runs.
 */
export function adminActions<T extends Record<string, (event: RequestEvent) => unknown>>(
	actions: T
): T {
	return Object.fromEntries(
		Object.entries(actions).map(([name, action]) => [
			name,
			(event: RequestEvent) => {
				requirePlatformAdmin(event.locals.user, event.url.pathname);
				return action(event);
			}
		])
	) as T;
}
