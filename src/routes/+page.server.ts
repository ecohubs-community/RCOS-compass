import { fail } from '@sveltejs/kit';
import { systemClock } from '$lib/server/clock';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { communitiesOf } from '$lib/server/services/tenancy';
import { detectPersonTimeZone } from '$lib/server/services/time-zone';
import type { Actions, PageServerLoad } from './$types';

/**
 * The front page is the landing page, for everybody.
 *
 * Signed in, it also carries the reader's own account menu: their email, the
 * communities they are a member of, and sign-out. Nothing about any community
 * is shown to anyone who is not in it — the list is only ever the reader's own.
 *
 * The landing page needs the public address (for its canonical URL and link
 * previews) and the contact address its "Request pilot access" buttons write
 * to; neither is a secret.
 */
export const load: PageServerLoad = ({ locals }) => {
	const config = getConfig();
	return {
		appUrl: config.PUBLIC_APP_URL,
		contactEmail: config.CONTACT_EMAIL,
		account: locals.user
			? { email: locals.user.email, communities: communitiesOf(getDb(), locals.user.id) }
			: null
	};
};

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
