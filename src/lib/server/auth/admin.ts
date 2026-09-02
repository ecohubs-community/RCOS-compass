import { error } from '@sveltejs/kit';
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
 * Guards an admin route. Called in `hooks.server.ts`, again in the admin
 * layout, and again in every action — three checks, because one of them will
 * eventually be edited by someone in a hurry.
 */
export function requirePlatformAdmin(user: User | null): void {
	const status = adminStatus(user);
	// Not-an-admin and no-such-page are the same answer on purpose.
	if (status === 'not_admin') error(404, 'Not found');
	if (status === 'needs_two_factor') {
		error(403, 'Set up two-factor authentication before using the admin console.');
	}
}
