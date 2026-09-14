import { and, eq, isNull, sql } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { getConfig, isPlatformAdmin } from '../config.js';
import { getDb, type Db } from '../db/index.js';
import { account, session, user, verification } from '../db/schema/auth.js';
import { twoFactor } from '../db/schema/auth.js';
import { auditEvent, invitation, membership } from '../db/schema/tenancy.js';
import { recordAudit } from './audit.js';
import { membershipLabel } from './person.js';

/**
 * Being forgotten, without unmaking the record.
 * `docs/03-data-model.md` §10, `docs/10-legal-and-operations.md` §6.
 *
 * Two obligations that look like they cannot both hold. The register is
 * append-only because a decision record that can be silently unmade is worthless
 * — a community cannot govern itself from a history somebody edits. Erasure is a
 * right, and not a negotiable one.
 *
 * They coexist because **nothing in the register refers to a person**. It refers
 * to a membership: `decision_attendee.membership_id` is what proves eleven
 * people were present, and it goes on proving it after one of them is gone. What
 * erasure removes is the profile the membership points at — the name, the
 * address, the avatar, the credentials — and every surface then renders that
 * membership as `Former member (M-0142)` instead.
 *
 * The row is not deleted, deliberately. `on delete set null` would leave a null
 * where an attendee was, and a null does not say "somebody who has since been
 * erased" — it says nothing, and a tally that quietly loses a row is a falsified
 * record.
 */

export type EraseInput = {
	userId: string;
	/** Them, or an administrator acting on a request that arrived by email. */
	actorId: string;
	now: number;
};

export function erasePerson(db: Db = getDb(), input: EraseInput): void {
	const person = db.select().from(user).where(eq(user.id, input.userId)).get();
	// The same answer for an id that never existed and one already erased: this
	// is not a place to confirm which addresses have accounts.
	if (!person || person.erasedAt) error(404, 'Not found');

	refuseIfSoleOwner(db, input.userId);
	refuseIfLastAdmin(db, person.email);

	const at = new Date(input.now);
	const labels = db
		.select({ communityId: membership.communityId, seq: membership.seq })
		.from(membership)
		.where(eq(membership.userId, input.userId))
		.all();

	db.transaction((tx) => {
		/**
		 * The address is replaced, not kept and not hashed.
		 *
		 * A hash of an email is recoverable by anybody who can guess the address —
		 * which is exactly the person the erasure was requested against. Keeping
		 * one so that a later re-registration could be recognised would trade the
		 * whole point of the act for a convenience nobody asked for. The
		 * placeholder is derived from the id so the unique index still holds and
		 * the real address is free for whoever wants it next.
		 */
		tx.update(user)
			.set({
				name: '',
				email: `erased+${input.userId}@invalid`,
				emailVerified: false,
				image: null,
				twoFactorEnabled: false,
				// Where somebody lives is a fact about them, not about the record.
				timeZone: null,
				erasedAt: at,
				erasedBy: input.actorId,
				updatedAt: at
			})
			.where(eq(user.id, input.userId))
			.run();

		// Nothing left that could authenticate as them.
		tx.delete(session).where(eq(session.userId, input.userId)).run();
		tx.delete(account).where(eq(account.userId, input.userId)).run();
		tx.delete(twoFactor).where(eq(twoFactor.userId, input.userId)).run();
		tx.delete(verification).where(eq(verification.identifier, person.email)).run();

		/**
		 * The name they chose in each community goes with the one on the account.
		 * `personLabel` never renders it once `erased_at` is set, but the row would
		 * still be holding a name after being asked not to, which is the thing
		 * itself rather than a display of it.
		 */
		tx.update(membership)
			.set({ displayName: null })
			.where(eq(membership.userId, input.userId))
			.run();

		/**
		 * The address copied onto their audit events when they were written.
		 *
		 * The column's comment used to justify itself by the actor's *deletion* —
		 * true when a user row could vanish, and inverted now that it survives as a
		 * tombstone. The event keeps its action, its time and its actor id; only
		 * the copy of the address goes.
		 */
		tx.update(auditEvent)
			.set({ actorEmail: null })
			.where(eq(auditEvent.actorId, input.userId))
			.run();

		/**
		 * An open invitation to that address is a standing copy of it and a live
		 * way back into a community. Revoked rather than deleted, so a steward
		 * looking for what happened to it finds an answer.
		 */
		tx.update(invitation)
			.set({ revokedAt: at })
			.where(
				and(
					sql`lower(${invitation.email}) = ${person.email.toLowerCase()}`,
					isNull(invitation.acceptedAt),
					isNull(invitation.revokedAt)
				)
			)
			.run();

		/**
		 * Recorded as an act, without recording who it was about.
		 *
		 * The membership labels are the whole of what is kept: they are what the
		 * community's own records already show, and they identify a membership
		 * rather than a person.
		 */
		recordAudit(
			tx as unknown as Db,
			{ now: () => input.now },
			{
				action: 'account.erased',
				actorId: input.actorId === input.userId ? null : input.actorId,
				communityId: labels.length === 1 ? labels[0]!.communityId : null,
				target: null,
				meta: { memberships: labels.map((row) => membershipLabel(row.seq)) }
			}
		);
	});
}

/**
 * A community whose only owner erased themselves has nobody who can transfer it,
 * suspend it or delete it. The refusal names the way out rather than being a
 * flat no.
 */
function refuseIfSoleOwner(db: Db, userId: string): void {
	const owned = db
		.select({ communityId: membership.communityId })
		.from(membership)
		.where(
			and(eq(membership.userId, userId), eq(membership.isOwner, true), isNull(membership.endedAt))
		)
		.all();

	if (owned.length > 0) {
		error(
			409,
			'You own a community. Transfer ownership to another member first, then ask again — ' +
				'a community with no owner cannot be governed or closed.'
		);
	}
}

/**
 * And an instance with no administrator cannot be restored, have a tenant
 * created, or have anything fixed. Same shape of refusal, one level up.
 */
function refuseIfLastAdmin(db: Db, email: string): void {
	const admins = getConfig().adminEmails;
	if (!isPlatformAdmin(email, true, admins)) return;

	const remaining = db
		.select({ email: user.email, verified: user.emailVerified })
		.from(user)
		.where(isNull(user.erasedAt))
		.all()
		.filter(
			(row) =>
				row.email.toLowerCase() !== email.toLowerCase() &&
				isPlatformAdmin(row.email, row.verified, admins)
		);

	if (remaining.length === 0) {
		error(
			409,
			'You are the only administrator of this instance. Add another one before erasing this account.'
		);
	}
}
