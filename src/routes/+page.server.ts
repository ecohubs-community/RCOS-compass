import { fail } from '@sveltejs/kit';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { communitiesOf } from '$lib/server/services/tenancy';
import { detectPersonTimeZone } from '$lib/server/services/time-zone';
import type { Actions, PageServerLoad } from './$types';

/**
 * The front page: a way in for somebody signed out, and the way to their
 * communities for somebody signed in. Nothing about any community is shown to
 * anyone who is not in it — the list is only ever the reader's own.
 */
export const load: PageServerLoad = ({ locals }) => ({
	signedIn: locals.user !== null,
	communities: locals.user ? communitiesOf(getDb(), locals.user.id) : []
});

export const actions: Actions = {
	/**
	 * The browser's zone, reported once by the root layout when none is set.
	 * Never overwrites: see `detectPersonTimeZone`.
	 *
	 * Here rather than under a community: it belongs to the person, and the root
	 * layout that reports it runs on pages with no community in scope.
	 */
	detectTimeZone: async (event) => {
		const user = event.locals.user;
		if (!user) return fail(401, { changed: false });
		const form = await event.request.formData();
		const zone = String(form.get('timeZone') ?? '');
		const changed = detectPersonTimeZone(getDb(), user.id, zone, systemClock.now());
		if (changed) user.timeZone = zone;
		return { step: 'detectTimeZone', changed };
	}
};
