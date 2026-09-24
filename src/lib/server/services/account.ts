import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import * as v from 'valibot';
import { acceptingNameSchema } from '../../shared/schemas/invitations.js';
import type { Db } from '../db/index.js';
import { user } from '../db/schema/auth.js';
import { membership } from '../db/schema/tenancy.js';
import { membershipLabel } from './person.js';

/**
 * The signed-in person's own account: what they are called, and what erasing it
 * would leave behind. The `Account` panel in a community's settings and in the
 * admin console's.
 *
 * Takes a user id rather than a `Ctx`, like the time zone: the account belongs
 * to the person, not to the community whose settings happen to be open. The
 * caller passes `locals.user.id`, never an id from a form.
 */

/**
 * Change the name on the account.
 *
 * One column, and every surface reads it through `personLabel`, so a new name
 * shows in every community at once — the sidebar, the rail, the register. The
 * same rule as the name typed when accepting an invitation, so an account cannot
 * be renamed into something it could not have been created with.
 */
export function renamePerson(db: Db, userId: string, name: unknown, now: number): string {
	const parsed = v.safeParse(acceptingNameSchema, name);
	if (!parsed.success) error(400, parsed.issues[0]!.message);
	db.update(user)
		.set({ name: parsed.output, updatedAt: new Date(now) })
		.where(eq(user.id, userId))
		.run();
	return parsed.output;
}

/**
 * What the erase section states before it offers the button.
 *
 * Every membership, ended ones included: a community somebody left still holds
 * their history, and it is there they will read as `Former member (M-0142)`.
 */
export function erasureSummary(db: Db, userId: string) {
	const seats = db
		.select({ seq: membership.seq, isOwner: membership.isOwner })
		.from(membership)
		.where(eq(membership.userId, userId))
		.all();
	return {
		labels: seats.map((seat) => membershipLabel(seat.seq)),
		ownsAnything: seats.some((seat) => seat.isOwner)
	};
}
