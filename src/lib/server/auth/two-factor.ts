import { eq } from 'drizzle-orm';
import { getDb, type Db } from '../db/index.js';
import { account, twoFactor, type User } from '../db/schema/auth.js';
import { getAuth } from './auth.js';
import { readAuth, type AuthOutcome } from './api.js';

/**
 * The second factor. docs/04-security.md §6, openspec authentication spec
 * "Platform admins must hold a second factor".
 *
 * Available to anyone and required of platform admins. The library owns the
 * secret, the codes and the verification; this module owns the shape the two
 * screens need — which state the account is in, and whether re-authentication
 * is required before changing it.
 *
 * Two facts drive the screens:
 *  - a row exists but is unverified until a code from the app proves the secret
 *    arrived intact, so an interrupted enrolment locks nobody out;
 *  - a magic-link-only account has no password to re-authenticate with, so the
 *    plugin runs in `allowPasswordless` mode and the *account* decides whether
 *    the password field is shown.
 */

/** The cookie better-auth sets to carry a half-finished sign-in. */
export const TWO_FACTOR_CHALLENGE_COOKIE = 'compass.two_factor';

export type TwoFactorState = {
	/** A secret exists, verified or not. */
	enrolled: boolean;
	/** A code from the app has been checked against the secret. */
	verified: boolean;
	/** The account has a password, so changes must be re-authenticated. */
	requiresPassword: boolean;
};

export function twoFactorState(user: User, db: Db = getDb()): TwoFactorState {
	const row = db.select().from(twoFactor).where(eq(twoFactor.userId, user.id)).get();
	const credential = db
		.select()
		.from(account)
		.where(eq(account.userId, user.id))
		.all()
		.find((a) => a.password !== null && a.password !== '');

	return {
		enrolled: row !== undefined,
		verified: row?.verified === true,
		requiresPassword: credential !== undefined
	};
}

export type Enrolment = {
	/** `otpauth://…` — what a QR code would encode, offered for manual entry. */
	totpURI: string;
	/** Shown once. Not recoverable afterwards without starting again. */
	backupCodes: string[];
};

/**
 * Start enrolment: mint a secret and recovery codes, leaving the factor
 * unverified until {@link confirmEnrolment}.
 */
export async function beginEnrolment(
	headers: Headers,
	password: string | undefined
): Promise<AuthOutcome<Enrolment>> {
	const response = await getAuth().api.enableTwoFactor({
		headers,
		body: { method: 'totp' as const, ...(password === undefined ? {} : { password }) },
		asResponse: true
	});
	return readAuth<Enrolment>(response);
}

/**
 * Finish enrolment with a code from the authenticator. On success the library
 * marks the factor verified and rotates the session.
 */
export async function confirmEnrolment(
	headers: Headers,
	code: string
): Promise<AuthOutcome<ChallengeAccepted>> {
	const response = await getAuth().api.verifyTOTP({
		headers,
		body: { code },
		asResponse: true
	});
	return readAuth<ChallengeAccepted>(response);
}

/** Remove the second factor. An admin who does this loses the console. */
export async function removeEnrolment(
	headers: Headers,
	password: string | undefined
): Promise<AuthOutcome<unknown>> {
	const response = await getAuth().api.disableTwoFactor({
		headers,
		body: password === undefined ? {} : { password },
		asResponse: true
	});
	return readAuth(response);
}

/** What the library returns once a challenge is answered. */
export type ChallengeAccepted = { token?: string };

/** Answer the sign-in challenge with a code from the authenticator app. */
export async function answerChallengeWithCode(
	headers: Headers,
	code: string
): Promise<AuthOutcome<ChallengeAccepted>> {
	const response = await getAuth().api.verifyTOTP({
		headers,
		body: { code },
		asResponse: true
	});
	return readAuth<ChallengeAccepted>(response);
}

/** Answer it with a recovery code, for the phone that is gone. */
export async function answerChallengeWithBackupCode(
	headers: Headers,
	code: string
): Promise<AuthOutcome<ChallengeAccepted>> {
	const response = await getAuth().api.verifyBackupCode({
		headers,
		body: { code },
		asResponse: true
	});
	return readAuth<ChallengeAccepted>(response);
}

/**
 * The base32 secret inside an `otpauth://` URI, in the groups of four that
 * authenticator apps ask for when a code cannot be scanned.
 */
export function manualEntryKey(totpURI: string): string | null {
	const secret = new URL(totpURI).searchParams.get('secret');
	if (!secret) return null;
	return secret.replace(/(.{4})/g, '$1 ').trim();
}
