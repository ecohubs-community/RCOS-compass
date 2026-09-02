import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, twoFactor } from 'better-auth/plugins';
import { getConfig } from '../config.js';
import { getDb, type Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

/**
 * Identity. docs/04-security.md §3.
 *
 * The library owns sessions, verification and credentials; this application owns
 * membership and permissions. Nothing here knows about communities — a session
 * says who someone is, and `services/tenancy.ts` decides what that means inside
 * a particular community, per request.
 */
/**
 * The database is a parameter so a test can point the library at its own
 * migrated file. Application code always uses {@link getAuth}, which binds the
 * singleton.
 */
export function createAuth(db: Db = getDb()) {
	const config = getConfig();

	return betterAuth({
		appName: 'RCOS Compass',
		logger: { level: config.isTest ? 'debug' : 'error' },
		baseURL: config.PUBLIC_APP_URL,
		secret: config.BETTER_AUTH_SECRET,
		database: drizzleAdapter(db, { provider: 'sqlite', schema }),

		emailAndPassword: {
			enabled: true,
			// No composition rules — length is what actually helps, and a
			// compromised-password check lands with the sign-up flow.
			minPasswordLength: 12,
			maxPasswordLength: 200,
			requireEmailVerification: true
		},

		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true
		},

		session: {
			// Rolling 30 days, and an absolute ceiling so a session cannot live
			// forever on activity alone.
			expiresIn: 60 * 60 * 24 * 30,
			updateAge: 60 * 60 * 24,
			freshAge: 60 * 15
		},

		advanced: {
			cookiePrefix: 'compass',
			useSecureCookies: config.isProduction,
			defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' }
		},

		plugins: [
			// A link is friendlier than a password for a group that signs in rarely.
			magicLink({
				sendMagicLink: async () => {
					// Wired to the mail transport in task 6.3, with the invitation mail.
				}
			}),
			// Available to everyone; required for platform admins (docs/04 §6).
			twoFactor({ issuer: 'RCOS Compass' })
		]
	});
}

/**
 * The concrete instantiation, not `ReturnType<typeof betterAuth>` — annotating
 * it with the generic base widens the options type and the adapter no longer
 * matches.
 */
export type Auth = ReturnType<typeof createAuth>;

let instance: Auth | null = null;

export function getAuth(): Auth {
	instance ??= createAuth();
	return instance;
}

/** Test seam. */
export function resetAuthForTests(): void {
	instance = null;
}
