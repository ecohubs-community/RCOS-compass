import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminStatus } from '../../src/lib/server/auth/admin.js';
import { createAuth, resetAuthForTests } from '../../src/lib/server/auth/auth.js';
import { parseSetCookie } from '../../src/lib/server/auth/cookies.js';
import {
	answerChallengeWithBackupCode,
	answerChallengeWithCode,
	beginEnrolment,
	confirmEnrolment,
	manualEntryKey,
	removeEnrolment,
	twoFactorState
} from '../../src/lib/server/auth/two-factor.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { twoFactor, user } from '../../src/lib/server/db/schema/auth.js';
import { createTestDb } from '../support/db.js';

/**
 * The second factor, exercised against the real library rather than described.
 *
 * The point of this suite is that the admin console is gated on TOTP, so
 * everything here is load-bearing: a wrong assumption about how better-auth
 * stores or verifies a factor locks the only administrator out of the instance.
 */
let db: Db;
let cleanup: () => void;
let auth: ReturnType<typeof createAuth>;

const credentials = { email: 'ops@example.org', password: 'a-long-enough-password', name: 'Ops' };

/**
 * A browser's cookie jar, built out of the same parser the application uses, so
 * a sequence of calls behaves the way a sequence of requests would.
 */
class Jar {
	private readonly cookies = new Map<string, string>();

	absorb(response: Response): void {
		for (const header of response.headers.getSetCookie()) {
			const parsed = parseSetCookie(header);
			if (!parsed) continue;
			if (parsed.options.maxAge === 0) this.cookies.delete(parsed.name);
			else this.cookies.set(parsed.name, parsed.value);
		}
	}

	has(name: string): boolean {
		return this.cookies.has(name);
	}

	headers(): Headers {
		return new Headers({
			cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
		});
	}
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	resetAuthForTests();
	auth = createAuth(db);
});

afterEach(() => {
	setDbForTests(null);
	resetAuthForTests();
	vi.unstubAllEnvs();
	resetConfigForTests();
	cleanup();
});

/** Sign up, verify the address the way the mail link would, and sign in. */
async function signedIn(): Promise<{ jar: Jar; userId: string }> {
	await auth.api.signUpEmail({ body: credentials });
	const created = db.select().from(user).where(eq(user.email, credentials.email)).get()!;
	db.update(user).set({ emailVerified: true }).where(eq(user.id, created.id)).run();

	const response = await auth.api.signInEmail({
		body: { email: credentials.email, password: credentials.password },
		asResponse: true
	});
	const jar = new Jar();
	jar.absorb(response);
	return { jar, userId: created.id };
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * What an authenticator app does with the key it was given: the `secret` in an
 * `otpauth://` URI is base32, and the code is derived from the bytes behind it.
 * Decoding it here is what makes this a test of the real thing rather than of
 * one library function calling another with its own private representation.
 */
function fromBase32(encoded: string): string {
	let bits = 0;
	let value = 0;
	const bytes: number[] = [];
	for (const character of encoded.replace(/=+$/, '')) {
		const index = BASE32.indexOf(character.toUpperCase());
		if (index < 0) continue;
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			bytes.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return Buffer.from(bytes).toString('utf8');
}

/** The code an authenticator app would be showing for this secret, right now. */
async function currentCode(totpURI: string): Promise<string> {
	const secret = fromBase32(new URL(totpURI).searchParams.get('secret')!);
	const { code } = await auth.api.generateTOTP({ body: { secret } });
	return code;
}

/**
 * Enrol from start to finish, the way the page does.
 *
 * Confirming rotates the session — better-auth issues a new one and deletes the
 * old — so the jar has to follow it. Missing that is not a test detail: a page
 * that forgets to re-issue the cookie signs the user out at the moment they
 * finish securing their account.
 */
async function enrol(jar: Jar): Promise<{ totpURI: string; backupCodes: string[] }> {
	const started = await beginEnrolment(jar.headers(), credentials.password);
	if (!started.ok) throw new Error('enrolment did not start');
	const confirmed = await confirmEnrolment(jar.headers(), await currentCode(started.data.totpURI));
	if (!confirmed.ok) throw new Error('enrolment did not confirm');
	jar.absorb(confirmed.response);
	return started.data;
}

describe('enrolling', () => {
	it('mints a secret that is not usable until a code proves it arrived', async () => {
		const { jar, userId } = await signedIn();

		const started = await beginEnrolment(jar.headers(), credentials.password);
		expect(started.ok).toBe(true);
		if (!started.ok) return;

		expect(started.data.totpURI).toMatch(/^otpauth:\/\/totp\//);
		expect(started.data.backupCodes.length).toBeGreaterThan(0);

		// The row exists, but the factor does not count yet — an enrolment
		// abandoned here locks nobody out.
		const row = db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).get();
		expect(row).toBeDefined();
		expect(row!.verified).toBe(false);
		expect(twoFactorState({ id: userId } as never, db).verified).toBe(false);

		const account = db.select().from(user).where(eq(user.id, userId)).get()!;
		expect(account.twoFactorEnabled).toBe(false);
	});

	it('stores neither the secret nor the recovery codes in the clear', async () => {
		const { jar, userId } = await signedIn();
		const started = await beginEnrolment(jar.headers(), credentials.password);
		if (!started.ok) throw new Error('enrolment did not start');

		const plaintext = new URL(started.data.totpURI).searchParams.get('secret')!;
		const row = db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).get()!;

		expect(row.secret).not.toBe(plaintext);
		expect(row.secret).not.toContain(plaintext);
		for (const code of started.data.backupCodes) {
			expect(row.backupCodes).not.toContain(code);
		}
	});

	it('completes when a code from the app matches, and not before', async () => {
		const { jar, userId } = await signedIn();
		const started = await beginEnrolment(jar.headers(), credentials.password);
		if (!started.ok) throw new Error('enrolment did not start');

		const wrong = await confirmEnrolment(jar.headers(), '000000');
		expect(wrong.ok).toBe(false);
		expect(db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).get()!.verified).toBe(
			false
		);

		const right = await confirmEnrolment(jar.headers(), await currentCode(started.data.totpURI));
		expect(right.ok).toBe(true);

		expect(db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).get()!.verified).toBe(
			true
		);
		expect(db.select().from(user).where(eq(user.id, userId)).get()!.twoFactorEnabled).toBe(true);
	});

	it('refuses to start on the wrong password', async () => {
		const { jar, userId } = await signedIn();

		const started = await beginEnrolment(jar.headers(), 'not-the-password');

		expect(started.ok).toBe(false);
		expect(db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).get()).toBeUndefined();
	});

	it('offers the secret in the groups a person can type', async () => {
		const uri = 'otpauth://totp/RCOS%20Compass:ops@example.org?secret=ABCDEFGHIJKLMNOP&issuer=x';
		expect(manualEntryKey(uri)).toBe('ABCD EFGH IJKL MNOP');
	});
});

describe('the sign-in challenge', () => {
	async function enrolled() {
		const { jar, userId } = await signedIn();
		return { userId, ...(await enrol(jar)) };
	}

	/** A second, empty browser: the password alone must not get in. */
	async function challenge(): Promise<Jar> {
		const response = await auth.api.signInEmail({
			body: { email: credentials.email, password: credentials.password },
			asResponse: true
		});
		const body = (await response.clone().json()) as { twoFactorRedirect?: boolean };
		expect(body.twoFactorRedirect, 'the password alone must not complete a sign-in').toBe(true);

		const jar = new Jar();
		jar.absorb(response);
		return jar;
	}

	it('withholds the session until a code is given', async () => {
		const { totpURI } = await enrolled();
		const jar = await challenge();

		expect(jar.has('compass.two_factor')).toBe(true);
		expect(jar.has('compass.session_token')).toBe(false);

		const accepted = await answerChallengeWithCode(jar.headers(), await currentCode(totpURI));
		expect(accepted.ok).toBe(true);
		if (!accepted.ok) return;
		jar.absorb(accepted.response);
		expect(jar.has('compass.session_token')).toBe(true);
	});

	it('refuses a wrong code without issuing anything', async () => {
		await enrolled();
		const jar = await challenge();

		const refused = await answerChallengeWithCode(jar.headers(), '000000');

		expect(refused.ok).toBe(false);
		expect(jar.has('compass.session_token')).toBe(false);
	});

	it('accepts a recovery code once, and only once', async () => {
		const { backupCodes } = await enrolled();
		const code = backupCodes[0]!;

		const first = await answerChallengeWithBackupCode((await challenge()).headers(), code);
		expect(first.ok).toBe(true);

		// The phone is gone; the notebook page is not a second phone.
		const second = await answerChallengeWithBackupCode((await challenge()).headers(), code);
		expect(second.ok).toBe(false);
	});

	it('refuses a factor that was never confirmed', async () => {
		// An abandoned enrolment must not become a barrier at the next sign-in.
		const { jar } = await signedIn();
		await beginEnrolment(jar.headers(), credentials.password);

		const response = await auth.api.signInEmail({
			body: { email: credentials.email, password: credentials.password },
			asResponse: true
		});
		const body = (await response.json()) as { twoFactorRedirect?: boolean };
		expect(body.twoFactorRedirect).toBeUndefined();
	});
});

describe('removing it', () => {
	it('takes the factor away and refuses the wrong password', async () => {
		const { jar, userId } = await signedIn();
		await enrol(jar);

		expect((await removeEnrolment(jar.headers(), 'not-the-password')).ok).toBe(false);
		expect(db.select().from(user).where(eq(user.id, userId)).get()!.twoFactorEnabled).toBe(true);

		expect((await removeEnrolment(jar.headers(), credentials.password)).ok).toBe(true);
		expect(db.select().from(user).where(eq(user.id, userId)).get()!.twoFactorEnabled).toBe(false);
	});
});

describe('the admin gate depends on all of it', () => {
	function asAdmin() {
		vi.stubEnv('ADMIN_EMAILS', credentials.email);
		// The configuration is cached after its first read, so it has to be asked
		// again once the environment changes.
		resetConfigForTests();
	}

	it('withholds the console from a listed admin who has not enrolled', async () => {
		asAdmin();
		const { userId } = await signedIn();
		const account = db.select().from(user).where(eq(user.id, userId)).get()!;

		expect(adminStatus(account)).toBe('needs_two_factor');
	});

	it('withholds it while the enrolment is unconfirmed', async () => {
		asAdmin();
		const { jar, userId } = await signedIn();
		await beginEnrolment(jar.headers(), credentials.password);

		const account = db.select().from(user).where(eq(user.id, userId)).get()!;
		expect(adminStatus(account)).toBe('needs_two_factor');
	});

	it('opens it once the factor is confirmed', async () => {
		asAdmin();
		const { jar, userId } = await signedIn();
		await enrol(jar);

		const account = db.select().from(user).where(eq(user.id, userId)).get()!;
		expect(adminStatus(account)).toBe('ok');
	});

	it('says nothing at all to someone who is not listed', async () => {
		// No ADMIN_EMAILS: enrolled or not, the answer is the one that becomes a 404.
		resetConfigForTests();
		const { jar, userId } = await signedIn();
		await enrol(jar);

		const account = db.select().from(user).where(eq(user.id, userId)).get()!;
		expect(adminStatus(account)).toBe('not_admin');
	});

	it('closes it again when the factor is removed', async () => {
		asAdmin();
		const { jar, userId } = await signedIn();
		await enrol(jar);
		await removeEnrolment(jar.headers(), credentials.password);

		const account = db.select().from(user).where(eq(user.id, userId)).get()!;
		expect(adminStatus(account)).toBe('needs_two_factor');
	});
});
