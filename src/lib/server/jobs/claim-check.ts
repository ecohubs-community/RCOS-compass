import { and, eq, isNull } from 'drizzle-orm';
import { anonymousIn } from '../auth/audience.js';
import { can } from '../auth/permissions.js';
import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { community, membership } from '../db/schema/tenancy.js';
import { outwardClaim } from '../services/claim.js';
import { notify } from '../services/notifications.js';

/**
 * Whether a community can still say it complies, and who to tell when it no
 * longer can. `openspec/changes/notifications-page`, UI spec §4.11.
 *
 * A job of its own, enqueued by a freeze (the usual cause) and by the hourly
 * sweep (a standard changing, an exception running out), so computing the claim
 * never happens inside anyone's write.
 *
 * Only the change from yes to no is told, to the people who can act on it. The
 * first check a community ever gets records its answer silently: a community
 * that has never complied has lost nothing, and one that did before this was
 * built should not be told today about a day in the past.
 */
export type ClaimCheckPayload = { communityId: string };

export type ClaimCheckOutcome = 'withdrawn' | 'recorded' | 'skipped';

export function runClaimCheck(db: Db, clock: Clock, payload: ClaimCheckPayload): ClaimCheckOutcome {
	const home = db.select().from(community).where(eq(community.id, payload.communityId)).get();
	if (!home || home.status !== 'active') return 'skipped';

	// The claim as the world reads it: exactly what is said outwardly.
	const compliant = outwardClaim(anonymousIn(home.id), { db })?.compliant ?? false;
	const withdrawn = home.claimCompliant === true && !compliant;

	return db.transaction((tx) => {
		tx.update(community).set({ claimCompliant: compliant }).where(eq(community.id, home.id)).run();
		if (!withdrawn) return 'recorded';

		// Whoever may change what the claim rests on, by capability rather than by role.
		const stewards = tx
			.select({ id: membership.id, role: membership.role, isOwner: membership.isOwner })
			.from(membership)
			.where(and(eq(membership.communityId, home.id), isNull(membership.endedAt)))
			.all()
			.filter((seat) => can(seat, 'settings.manage'))
			.map((seat) => seat.id);

		notify(
			tx as unknown as Db,
			{ community: home, membership: null, now: clock.now },
			{
				kind: 'claim.withdrawn',
				subjectType: 'community',
				subjectId: home.id,
				summary: 'The compliance claim was withdrawn',
				params: {},
				recipients: stewards,
				mail: true
			}
		);
		return 'withdrawn';
	});
}
