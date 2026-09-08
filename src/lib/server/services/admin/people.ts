import { systemClock } from '../../clock.js';
import type { Db } from '../../db/index.js';
import { erasePerson } from '../erasure.js';

/**
 * The one thing the console may do to a person. `docs/05-admin-console.md` §2.
 *
 * It exists as an admin service rather than the route calling `erasure`
 * directly, because the boundary test forbids an admin route from reaching past
 * `services/admin` — and that rule is right: a route that may import one service
 * may import the next one, and the console's whole discipline is that it sees
 * metadata and never content.
 *
 * What it does *not* add is discretion. Every refusal belongs to the service
 * underneath — an owner still has to transfer first, the last administrator is
 * still refused — because an administrator being able to erase somebody the
 * person themselves could not is a different power than the one this is for.
 */
export function erasePersonAsAdmin(
	db: Db,
	input: { userId: string; actorId: string; now?: number }
): void {
	erasePerson(db, {
		userId: input.userId,
		actorId: input.actorId,
		now: input.now ?? systemClock.now()
	});
}
