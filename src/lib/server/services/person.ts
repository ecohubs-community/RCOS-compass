/**
 * How a person is named, everywhere. `docs/03-data-model.md` §10.
 *
 * One function, because erasure is not a change to one query: it is the promise
 * that *no surface* prints a name after somebody has asked it not to, and a
 * promise like that is kept in one place or not at all.
 * `tests/support/person-surfaces.ts` enumerates the callers so that a service
 * added later and not routed through here fails the suite.
 *
 * **The label is community-local.** `M-0142` is a membership's number inside one
 * community, so a surface that has a community in scope shows it and a
 * platform-wide one — the admin audit trail, a sign-in failure — shows an erased
 * account with no number at all. A global identifier for somebody who asked to
 * be forgotten is precisely the thing that would let two communities' records be
 * joined back together, which is what scoping the label avoids.
 *
 * **English, like `additionLabel`.** These strings travel into export bundles,
 * mirror commits and public pages, produced by jobs with no request and no
 * reader whose language we could know. One form everywhere is worth more than a
 * form per surface, and the label is closer to `DEC-2026-001` than to a
 * sentence.
 */

export type Person = {
	erasedAt: Date | null;
	/** Their account name. Empty once erased. */
	name?: string | null;
	/** What they chose to be called in this community, where there is one. */
	displayName?: string | null;
	/** Their number in the community in scope, where there is one. */
	seq?: number | null;
};

export const ERASED_WITHOUT_COMMUNITY = 'Erased account';

export const membershipLabel = (seq: number): string => `M-${String(seq).padStart(4, '0')}`;

export function personLabel(person: Person): string {
	if (person.erasedAt) {
		return typeof person.seq === 'number' && person.seq > 0
			? `Former member (${membershipLabel(person.seq)})`
			: ERASED_WITHOUT_COMMUNITY;
	}

	// Their own choice first: a display name exists because somebody preferred it
	// to the name on their account.
	return person.displayName?.trim() || person.name?.trim() || ERASED_WITHOUT_COMMUNITY;
}

/**
 * The same decision for a surface that holds an address rather than a name.
 *
 * A steward's usage table and the platform audit trail both print email
 * addresses, which is worse than printing a name: an address is a way to reach
 * somebody, and one belonging to a person who asked to be forgotten is the thing
 * erasure exists to remove.
 */
export function personAddress(person: Person & { email?: string | null }): string {
	if (person.erasedAt) return personLabel(person);
	return person.email?.trim() || personLabel(person);
}
