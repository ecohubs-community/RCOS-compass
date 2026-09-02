import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuth } from '../../src/lib/server/auth/auth.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { account, session, user } from '../../src/lib/server/db/schema/auth.js';
import { createTestDb } from '../support/db.js';

/**
 * Whether better-auth actually accepts our schema, asked by using it rather than
 * by reading the library's source. The tables in db/schema/auth.ts were written
 * to match what the Drizzle adapter expects; if that guess is wrong, these fail
 * at the first write.
 */
let db: Db;
let cleanup: () => void;
let auth: ReturnType<typeof createAuth>;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	auth = createAuth(db);
});
afterEach(() => cleanup());

const credentials = { email: 'ana@example.org', password: 'a-long-enough-password', name: 'Ana' };

describe('the adapter agrees with our schema', () => {
	it('writes a sign-up into our own user and account tables', async () => {
		await auth.api.signUpEmail({ body: credentials });

		const created = db.select().from(user).where(eq(user.email, credentials.email)).get();
		expect(created).toBeDefined();
		expect(created!.name).toBe('Ana');
		// Verification is required, so a fresh account starts unverified.
		expect(created!.emailVerified).toBe(false);

		const credential = db.select().from(account).where(eq(account.userId, created!.id)).get();
		expect(credential).toBeDefined();
		expect(credential!.password, 'the password must be hashed, never stored raw').not.toBe(
			credentials.password
		);
	});

	it('stores nothing recognisable as the password', async () => {
		await auth.api.signUpEmail({ body: credentials });
		const rows = db.select().from(account).all();
		for (const row of rows) {
			expect(row.password).not.toContain(credentials.password);
		}
	});
});

describe('a session is established by a verified email', () => {
	it('refuses sign-in while the address is unverified', async () => {
		await auth.api.signUpEmail({ body: credentials });

		await expect(
			auth.api.signInEmail({ body: { email: credentials.email, password: credentials.password } })
		).rejects.toThrow();

		expect(db.select().from(session).all()).toHaveLength(0);
	});

	it('issues a session once the address is verified', async () => {
		await auth.api.signUpEmail({ body: credentials });
		const created = db.select().from(user).where(eq(user.email, credentials.email)).get()!;
		db.update(user).set({ emailVerified: true }).where(eq(user.id, created.id)).run();

		const result = await auth.api.signInEmail({
			body: { email: credentials.email, password: credentials.password }
		});

		expect(result).toBeDefined();
		const sessions = db.select().from(session).where(eq(session.userId, created.id)).all();
		expect(sessions).toHaveLength(1);
		expect(sessions[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
	});
});

describe('credentials do not leak whether an account exists', () => {
	it('answers the same for an unknown address as for a wrong password', async () => {
		await auth.api.signUpEmail({ body: credentials });
		const created = db.select().from(user).where(eq(user.email, credentials.email)).get()!;
		db.update(user).set({ emailVerified: true }).where(eq(user.id, created.id)).run();

		const wrongPassword = await auth.api
			.signInEmail({ body: { email: credentials.email, password: 'not-the-password' } })
			.then(() => null)
			.catch((error: { status?: string; body?: { message?: string } }) => error);

		const unknownAddress = await auth.api
			.signInEmail({ body: { email: 'nobody@example.org', password: 'not-the-password' } })
			.then(() => null)
			.catch((error: { status?: string; body?: { message?: string } }) => error);

		expect(wrongPassword).not.toBeNull();
		expect(unknownAddress).not.toBeNull();
		// Same status and same message: otherwise the response is an oracle for
		// which addresses have accounts.
		expect(unknownAddress!.status).toBe(wrongPassword!.status);
		expect(unknownAddress!.body?.message).toBe(wrongPassword!.body?.message);
	});
});

describe('a short password is refused', () => {
	it('rejects anything under the minimum length', async () => {
		await expect(
			auth.api.signUpEmail({ body: { ...credentials, password: 'short' } })
		).rejects.toThrow();
	});
});
