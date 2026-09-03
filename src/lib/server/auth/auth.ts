import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink, twoFactor } from 'better-auth/plugins';
import { getConfig } from '../config.js';
import { getDb, type Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { getLogger } from '../logger.js';
import {
	getMailTransport,
	magicLinkMessage,
	verificationMessage,
	type MailTransport
} from '../mail/index.js';

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
/**
 * Send, and let a failure be visible without taking the request down with it.
 *
 * better-auth calls these callbacks inside its own endpoints; throwing from one
 * turns a successful sign-up into a 500 after the account already exists. The
 * address and the reason are logged instead, which is what an operator needs to
 * answer "why did nobody get the link" — and the subject line names the kind, so
 * no message body reaches the log.
 */
async function send(message: Parameters<MailTransport['send']>[0], kind: string): Promise<void> {
	try {
		await getMailTransport().send(message);
	} catch (error) {
		getLogger().error(
			{ kind, to: message.to, err: error instanceof Error ? error.message : String(error) },
			'mail not sent'
		);
	}
}

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
			autoSignInAfterVerification: true,
			// Without this nothing is sent, and `requireEmailVerification` above
			// turns every new account into a dead end. The body is composed in
			// mail/messages.ts, which is the only place a body is written.
			sendVerificationEmail: async ({ user, url }) => {
				await send(verificationMessage(user.email, url), 'verification');
			}
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
				sendMagicLink: async ({ email, url }) => {
					await send(magicLinkMessage(email, url), 'magic-link');
				}
			}),
			// Available to everyone; required for platform admins (docs/04 §6).
			//
			// `allowPasswordless` does not weaken re-authentication: the plugin
			// still demands the password of an account that has one. It only lets
			// an account that signs in by magic link — and therefore has no
			// password to be asked for — enrol at all.
			twoFactor({ issuer: 'RCOS Compass', allowPasswordless: true })
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
