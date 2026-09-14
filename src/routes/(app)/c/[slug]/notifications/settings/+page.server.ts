import { getDb } from '$lib/server/db';
import { run } from '$lib/server/http/form-action';
import {
	notificationPreferences,
	setNotificationPreferences
} from '$lib/server/services/notification-preferences';
import { timeZoneFor } from '$lib/time/zone';
import type { Actions, PageServerLoad } from './$types';

/**
 * A member's email settings for this community. `openspec/changes/notifications-page`.
 * Two fields and a submit, so it works the same without JavaScript.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	return {
		preferences: notificationPreferences(ctx, ctx.membership.id, { db: getDb() }),
		/** The zone a digest's "morning" is in — the member's, or the community's until they set one. */
		digestZone: timeZoneFor(ctx.user, ctx.community),
		ownZone: ctx.user.timeZone !== null
	};
};

export const actions: Actions = {
	default: async (event) => {
		const ctx = event.locals.ctx!;
		const form = await event.request.formData();
		return run('preferences', () =>
			setNotificationPreferences(
				ctx,
				ctx.membership.id,
				{
					emailEnabled: form.get('emailEnabled') === 'on',
					digestDay: Number(form.get('digestDay'))
				},
				{ db: getDb() }
			)
		);
	}
};
