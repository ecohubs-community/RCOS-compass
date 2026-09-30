import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAuth, resetAuthForTests } from '../../src/lib/server/auth/auth.js';
import { getConfig } from '../../src/lib/server/config.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { user } from '../../src/lib/server/db/schema/auth.js';
import {
	memoryTransport,
	resetMailTransportForTests,
	setMailTransportForTests
} from '../../src/lib/server/mail/index.js';
import { POST } from '../../src/routes/api/auth/[...all]/+server.js';
import { createTestDb } from '../support/db.js';

/**
 * The instance is invitation-only (`docs/10-legal-and-operations.md`): the
 * invitation page is the one place an account is made, and it makes it through
 * the library's server API. better-auth ships two public doors that would make
 * one without an invitation — email sign-up, and a magic link sent to an
 * address that has no account — and both were reachable over HTTP at
 * `/api/auth/*` although nothing in the interface linked to them.
 *
 * Asked the way an outsider would: through the route, with a real request.
 */
let db: Db;
let cleanup: () => void;
let mail: ReturnType<typeof memoryTransport>;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	resetAuthForTests();
	mail = memoryTransport();
	setMailTransportForTests(mail);
});

afterEach(() => {
	setDbForTests(null);
	resetAuthForTests();
	resetMailTransportForTests();
	cleanup();
});

const base = () => getConfig().PUBLIC_APP_URL.replace(/\/+$/, '');

/** A POST to the better-auth route, as a browser on this origin would send it. */
function post(path: string, body: unknown) {
	const request = new Request(`${base()}/api/auth${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', origin: base() },
		body: JSON.stringify(body)
	});
	return POST({ request } as Parameters<typeof POST>[0]);
}

const users = () => db.select().from(user).all();

describe('signing up without an invitation', () => {
	it('is refused over HTTP, and no account is made', async () => {
		const response = await post('/sign-up/email', {
			email: 'stranger@example.org',
			password: 'a-long-enough-password',
			name: 'Stranger'
		});

		expect(response.status).toBe(404);
		expect(users()).toEqual([]);
		expect(mail.sent).toEqual([]);
	});

	it('is refused however the path is spelled', async () => {
		const spellings = [
			'/sign-up/email/',
			'//sign-up/email',
			'/Sign-Up/Email',
			'/sign-up%2Femail',
			'/%73ign-up/email',
			'/%E0%A4%A'
		];
		for (const [i, spelling] of spellings.entries()) {
			const response = await post(spelling, {
				email: `stranger${i}@example.org`,
				password: 'a-long-enough-password',
				name: 'Stranger'
			});
			expect(response.status, spelling).toBe(404);
		}
		expect(users()).toEqual([]);
	});

	it('still works from the server, which is how the invitation page makes an account', async () => {
		await getAuth().api.signUpEmail({
			body: { email: 'invited@example.org', password: 'a-long-enough-password', name: 'Ana' }
		});

		expect(users().map((row) => row.email)).toEqual(['invited@example.org']);
	});
});

describe('a magic link to an address with no account', () => {
	it('makes no account when it is followed', async () => {
		const asked = await post('/sign-in/magic-link', { email: 'stranger@example.org' });
		// The request itself answers as it would for anybody — whether an address
		// has an account is not something this endpoint tells a stranger.
		expect(asked.status).toBe(200);

		// Sent all the same, so the answer cannot be used to test which addresses
		// have accounts. Following it is what used to make one.
		const link = mail.sent.at(-1)?.url;
		expect(link).toBeDefined();
		const token = new URL(link!).searchParams.get('token')!;
		await getAuth()
			.api.magicLinkVerify({ query: { token }, headers: new Headers() })
			.catch(() => {
				// Refused, which is the point; what matters is what it wrote.
			});

		expect(users()).toEqual([]);
	});

	it('still signs in somebody who has an account', async () => {
		await getAuth().api.signUpEmail({
			body: { email: 'ana@example.org', password: 'a-long-enough-password', name: 'Ana' }
		});
		mail.sent.length = 0;

		const asked = await post('/sign-in/magic-link', { email: 'ana@example.org' });
		expect(asked.status).toBe(200);
		expect(mail.sent.at(-1)?.subject).toBe('Your sign-in link');
	});
});

describe('the rest of the library', () => {
	it('is still served — signing in is not a door that closed with sign-up', async () => {
		const response = await post('/sign-in/email', {
			email: 'nobody@example.org',
			password: 'a-long-enough-password'
		});

		// Refused as a wrong password is, not as a route that does not exist.
		expect(response.status).toBe(401);
	});
});
