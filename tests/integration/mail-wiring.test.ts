import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuth, resetAuthForTests } from '../../src/lib/server/auth/auth.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import {
	memoryTransport,
	resetMailTransportForTests,
	setMailTransportForTests
} from '../../src/lib/server/mail/index.js';
import { createTestDb } from '../support/db.js';

/**
 * Whether the library actually sends anything, asked by making it do so.
 *
 * This is the gap that mattered: `requireEmailVerification` was on and
 * `sendOnSignUp` was true, but no `sendVerificationEmail` was configured — so
 * better-auth had nowhere to send the link, and every new account was a dead end
 * with nothing anywhere saying why.
 */
let db: Db;
let cleanup: () => void;
let auth: ReturnType<typeof createAuth>;
let mail: ReturnType<typeof memoryTransport>;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	resetAuthForTests();
	mail = memoryTransport();
	setMailTransportForTests(mail);
	auth = createAuth(db);
});

afterEach(() => {
	setDbForTests(null);
	resetAuthForTests();
	resetMailTransportForTests();
	cleanup();
});

describe('signing up', () => {
	it('sends a verification link to the address given', async () => {
		await auth.api.signUpEmail({
			body: { email: 'ana@example.org', password: 'a-long-enough-password', name: 'Ana' }
		});

		expect(mail.sent).toHaveLength(1);
		const [message] = mail.sent;
		expect(message!.to).toBe('ana@example.org');
		expect(message!.subject).toBe('Confirm your email address');
		expect(message!.url).toMatch(/^https?:\/\//);
	});

	it('puts no password anywhere in the message', async () => {
		const password = 'a-long-enough-password';
		await auth.api.signUpEmail({ body: { email: 'ana@example.org', password, name: 'Ana' } });

		for (const message of mail.sent) {
			expect(message.text).not.toContain(password);
		}
	});
});

describe('asking for a sign-in link', () => {
	it('sends one', async () => {
		await auth.api.signUpEmail({
			body: { email: 'ana@example.org', password: 'a-long-enough-password', name: 'Ana' }
		});
		mail.sent.length = 0;

		// The endpoint sets a cookie, so it insists on headers to set it against.
		await auth.api.signInMagicLink({
			body: { email: 'ana@example.org' },
			headers: new Headers()
		});

		expect(mail.sent).toHaveLength(1);
		expect(mail.sent[0]!.subject).toBe('Your sign-in link');
		expect(mail.sent[0]!.text).toContain(mail.sent[0]!.url!);
	});
});

describe('when the transport fails', () => {
	it('does not take the sign-up down with it', async () => {
		// The account already exists by the time the callback runs; throwing here
		// would answer a successful sign-up with a 500 and leave the person unable
		// to try again with the same address.
		setMailTransportForTests({
			id: 'broken',
			send: () => Promise.reject(new Error('connection refused'))
		});
		resetAuthForTests();
		auth = createAuth(db);

		await expect(
			auth.api.signUpEmail({
				body: { email: 'ana@example.org', password: 'a-long-enough-password', name: 'Ana' }
			})
		).resolves.toBeDefined();
	});
});
