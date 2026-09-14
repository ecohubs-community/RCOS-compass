import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { membership } from '$lib/server/db/schema/tenancy';
import { erasePerson } from '$lib/server/services/erasure';
import {
	detectPersonTimeZone,
	setPersonTimeZone,
	timeZoneChoices
} from '$lib/server/services/time-zone';
import { run } from '$lib/server/http/form-action';
import { membershipLabel } from '$lib/server/services/person';
import type { Actions, PageServerLoad } from './$types';

/**
 * The account, and the one irreversible thing a person can do to it.
 * `docs/03-data-model.md` §10.
 *
 * Deliberately outside `(app)`: this belongs to a person rather than to a
 * community, and somebody who wants to be forgotten should not have to pick a
 * community first.
 *
 * The screen states what survives before it offers the button. "Your decisions
 * stay, attributed to a number" is the sentence a community will argue about,
 * and it is better argued about here than discovered afterwards.
 */
export const load: PageServerLoad = ({ locals }) => {
	const user = locals.user;
	if (!user) redirect(303, '/sign-in');

	const db = getDb();
	const seats = db
		.select({
			communityId: membership.communityId,
			seq: membership.seq,
			isOwner: membership.isOwner
		})
		.from(membership)
		.where(eq(membership.userId, user.id))
		.all();

	return {
		email: user.email,
		name: user.name,
		// What their history will read as, shown before they decide rather than
		// after: `Former member (M-0142)` is abstract until you see your own.
		labels: seats.map((seat) => membershipLabel(seat.seq)),
		ownsAnything: seats.some((seat) => seat.isOwner),
		timeZone: user.timeZone,
		timeZones: timeZoneChoices()
	};
};

export const actions: Actions = {
	/** The zone the person chose from the list, or "use this device's". */
	setTimeZone: async (event) => {
		const user = event.locals.user;
		if (!user) redirect(303, '/sign-in');
		const form = await event.request.formData();
		const zone = String(form.get('timeZone') ?? '');
		return run('timeZone', () => {
			setPersonTimeZone(getDb(), user.id, zone, systemClock.now());
			// The person was read before this action ran, and the page rendered in the
			// same response reads it again: without this, a form posted without
			// JavaScript would show the old zone right after saving the new one.
			user.timeZone = zone;
		});
	},

	/**
	 * The browser's zone, reported once by the root layout when none is set.
	 * Never overwrites: see `detectPersonTimeZone`.
	 */
	detectTimeZone: async (event) => {
		const user = event.locals.user;
		if (!user) redirect(303, '/sign-in');
		const form = await event.request.formData();
		const zone = String(form.get('timeZone') ?? '');
		const changed = detectPersonTimeZone(getDb(), user.id, zone, systemClock.now());
		if (changed) user.timeZone = zone;
		return { step: 'detectTimeZone', changed };
	},

	erase: async (event) => {
		const user = event.locals.user;
		if (!user) redirect(303, '/sign-in');

		const form = await event.request.formData();
		// Typed confirmation, like every other irreversible act in the product.
		if (
			String(form.get('confirm') ?? '')
				.trim()
				.toLowerCase() !== 'erase'
		) {
			return fail(400, { error: 'Type erase to confirm.' });
		}

		try {
			erasePerson(getDb(), { userId: user.id, actorId: user.id, now: systemClock.now() });
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 409) return fail(409, { error: http.body?.message ?? '' });
			throw problem;
		}

		// Their session is gone with everything else; the sign-out route clears the
		// cookie so the browser is not left holding a token for nothing.
		redirect(303, '/sign-out');
	}
};
