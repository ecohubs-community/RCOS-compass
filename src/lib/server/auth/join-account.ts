import { and, asc, eq, isNotNull } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { account } from '../db/schema/auth.js';
import { getAuth } from './auth.js';

/**
 * An account made through a join link, and the password it gets afterwards.
 * `openspec/changes/pilot-blockers` D4.
 *
 * The join form is reachable by anyone the link was passed to, and an address
 * typed into it is not proven until its owner follows the mail. If the form
 * also took a password, whoever typed somebody else's address would know the
 * password of the account that address goes on to verify. So the account is
 * made with no credential at all, and its password is chosen on `/join` by the
 * person the verification mail signed in — the owner of the mailbox.
 */

/** A user row with no credential, unverified, through the library's own adapter. */
export async function createAccountWithoutPassword(input: {
	email: string;
	name: string;
}): Promise<{ id: string; email: string }> {
	const context = await getAuth().$context;
	const created = await context.internalAdapter.createUser(
		{ email: input.email.toLowerCase(), name: input.name, emailVerified: false },
		// A source the library knows; it validates user info against it when
		// configured to. The sign-up endpoint uses this one.
		{ method: 'email-password' }
	);
	return { id: created.id, email: created.email };
}

/** Whether this account can sign in with a password yet. */
export function hasPassword(db: Db, userId: string): boolean {
	return Boolean(
		db
			.select({ id: account.id })
			.from(account)
			.where(
				and(
					eq(account.userId, userId),
					eq(account.providerId, 'credential'),
					isNotNull(account.password)
				)
			)
			.get()
	);
}

/**
 * The first password, for an account that has none. Never replaces one: a
 * password already set is changed on the account page, which asks for it.
 *
 * Not the library's `setPassword`: that one asks for a session younger than a
 * quarter of an hour, and a person who confirms their address and comes back
 * to this page later must still be able to finish. The caller has checked the
 * session belongs to `userId`, whose address is verified.
 */
export async function setFirstPassword(
	db: Db,
	userId: string,
	password: string
): Promise<'set' | 'already_set'> {
	if (hasPassword(db, userId)) return 'already_set';
	const context = await getAuth().$context;
	const hash = await context.password.hash(password);
	const existing = await context.internalAdapter.findAccounts(userId);
	const credential = existing.find((row) => row.providerId === 'credential');
	if (credential) {
		await context.internalAdapter.updateAccount(credential.id, { password: hash });
	} else {
		await context.internalAdapter.linkAccount({
			userId,
			providerId: 'credential',
			accountId: userId,
			password: hash
		});
	}
	// Two submissions at once (a double tap on a slow phone) can both have
	// found no credential and both linked one. Keep the earliest, so exactly one
	// password signs in.
	const credentials = db
		.select({ id: account.id })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
		.orderBy(asc(account.createdAt), asc(account.id))
		.all();
	for (const extra of credentials.slice(1)) {
		db.delete(account).where(eq(account.id, extra.id)).run();
	}
	return 'set';
}
