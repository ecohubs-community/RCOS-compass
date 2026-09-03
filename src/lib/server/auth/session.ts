import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { session as sessionTable, user as userTable, type User } from '../db/schema/auth.js';
import { getAuth } from './auth.js';

/**
 * Who is making this request. docs/04-security.md §3.
 *
 * Two things this deliberately does not do: it does not carry a community (that
 * is resolved from the URL, per request), and it does not trust anything the
 * session captured at sign-in beyond the user's identity — role and membership
 * are looked up fresh so that a removal takes effect immediately.
 */
export type Actor = { user: User; sessionId: string } | null;

/** Absolute session lifetime, beyond which activity no longer extends it. */
export const ABSOLUTE_SESSION_MS = 90 * 24 * 60 * 60_000;

export async function resolveActor(db: Db, request: Request, now: number): Promise<Actor> {
	const result = await getAuth().api.getSession({ headers: request.headers });
	if (!result?.user) return null;

	const stored = db.select().from(sessionTable).where(eq(sessionTable.id, result.session.id)).get();
	if (!stored) return null;

	// better-auth rolls `expiresAt` forward on activity. Without a second bound a
	// session never truly ends, so the absolute ceiling is enforced here and the
	// session is destroyed rather than merely ignored.
	const absolute =
		stored.absoluteExpiresAt?.getTime() ?? stored.createdAt.getTime() + ABSOLUTE_SESSION_MS;
	if (now >= absolute) {
		db.delete(sessionTable).where(eq(sessionTable.id, stored.id)).run();
		return null;
	}

	const user = db.select().from(userTable).where(eq(userTable.id, result.user.id)).get();
	if (!user) return null;

	return { user, sessionId: stored.id };
}

/**
 * Record when this session must end regardless of activity.
 *
 * better-auth writes the session row itself and knows nothing about the absolute
 * ceiling, so it is stamped here, once, immediately after the sign-in that
 * created it. Only a row without one is stamped: re-running this against a live
 * session would push its ceiling forward, which is the behaviour the ceiling
 * exists to prevent.
 *
 * A session the library rotates — verifying a second factor does this — is a new
 * row and starts its own ninety days. That is deliberate: a rotation follows an
 * act of authentication, not mere activity.
 */
export function stampAbsoluteExpiry(db: Db, token: string, now: number): void {
	db.update(sessionTable)
		.set({ absoluteExpiresAt: new Date(now + ABSOLUTE_SESSION_MS) })
		.where(and(eq(sessionTable.token, token), isNull(sessionTable.absoluteExpiresAt)))
		.run();
}
