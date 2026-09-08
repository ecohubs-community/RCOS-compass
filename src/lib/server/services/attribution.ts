import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { decisionAttendee } from '../db/schema/decisions.js';
import { membership } from '../db/schema/tenancy.js';
import { user } from '../db/schema/auth.js';

/**
 * Who a decision is attributed to, outside the community.
 * `docs/03-data-model.md` §9, UI spec §1.6.
 *
 * The mockup's *"Attributed to the 11 people present"* is right inside a
 * community and wrong outward, and the difference is not a preference. Publishing
 * a name puts a permanent, indexable, screenshot-able record of who was in a
 * room on the open web, and it is the one thing in this phase that cannot be
 * walked back — unpublishing does not reach a cache or somebody's photograph of
 * the page.
 *
 * So a name appears outwardly only where **that attendee** consented. A
 * community-level policy widens what may be shown; it cannot supply consent on
 * anybody's behalf, and this function is where that is true rather than
 * remembered.
 */

export type OutwardAttribution = {
	/** How the decision was made, which is never personal. */
	mechanism: string;
	present: number | null;
	inFavour: number | null;
	/** Only those who said yes, individually. Empty is the normal case. */
	named: string[];
	/**
	 * How many were present but not named. Shown so a reader can see that the
	 * list is partial — "3 named of 11 present" is honest where three names
	 * alone would read as the whole room.
	 */
	unnamed: number;
};

export function outwardAttribution(
	db: Db,
	decisionRow: {
		id: string;
		mechanism: string;
		tallyPresent: number | null;
		tallyFor: number | null;
	},
	policy: 'roles_and_counts' | 'named_with_consent'
): OutwardAttribution {
	const attendees = db
		.select({
			consented: decisionAttendee.consentedToPublish,
			externalName: decisionAttendee.externalName,
			name: user.name,
			displayName: membership.displayName,
			erasedAt: user.erasedAt
		})
		.from(decisionAttendee)
		.leftJoin(membership, eq(membership.id, decisionAttendee.membershipId))
		.leftJoin(user, eq(user.id, membership.userId))
		.where(eq(decisionAttendee.decisionId, decisionRow.id))
		.all();

	/**
	 * Consent is checked here even when the policy is `roles_and_counts`, rather
	 * than the policy being checked first and consent second. Both orders give
	 * the same answer today; only this one still gives the right answer when
	 * somebody adds a third policy.
	 */
	/**
	 * An erased person is dropped rather than labelled.
	 *
	 * Every other surface renders `Former member (M-0142)`, and this is the one
	 * place that would be wrong: the list exists to say who agreed to be named
	 * outwardly, and somebody who has since asked to be forgotten gave the
	 * earlier, weaker instruction. They stay in `unnamed`, so the count is still
	 * honest about how many people were in the room.
	 */
	const named =
		policy === 'named_with_consent'
			? attendees
					.filter((row) => row.consented && !row.erasedAt)
					.map((row) => row.externalName ?? row.displayName ?? row.name)
					.filter((name): name is string => Boolean(name))
			: [];

	return {
		mechanism: decisionRow.mechanism,
		present: decisionRow.tallyPresent,
		inFavour: decisionRow.tallyFor,
		named,
		unnamed: Math.max(0, attendees.length - named.length)
	};
}
