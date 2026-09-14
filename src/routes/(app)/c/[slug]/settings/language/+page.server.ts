import { fail } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import {
	availableLocales,
	setCommunityLocale,
	setCommunityTimeZone
} from '$lib/server/services/community-locale';
import { timeZoneChoices } from '$lib/server/services/time-zone';
import type { Actions, PageServerLoad } from './$types';

/**
 * The language this community works in. UI spec §1.6, `docs/09` §i18n.
 *
 * One locale for the whole community rather than one per member: governance is
 * a shared activity, and two people reading the same rule in two languages is
 * how a disagreement becomes a translation argument. It is also why this is a
 * steward's decision and not a preference in an account menu.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	return {
		current: ctx.community.locale,
		currentTimeZone: ctx.community.timezone,
		timeZones: timeZoneChoices(),
		locales: availableLocales(),
		can: { manage: ctxCan(ctx, 'settings.manage') }
	};
};

export const actions: Actions = {
	locale: async (event) => {
		const form = await event.request.formData();
		try {
			setCommunityLocale(event.locals.ctx!, String(form.get('locale') ?? ''), { db: getDb() });
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 400)
				return fail(400, { step: 'locale', error: http.body?.message ?? '' });
			throw problem;
		}
		return { step: 'locale', saved: true };
	},

	/** The zone the community's calendar is kept in. `openspec/changes/local-time`. */
	timeZone: async (event) => {
		const form = await event.request.formData();
		try {
			setCommunityTimeZone(event.locals.ctx!, String(form.get('timeZone') ?? ''), {
				db: getDb()
			});
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 400) {
				return fail(400, { step: 'timeZone', error: http.body?.message ?? '' });
			}
			throw problem;
		}
		return { step: 'timeZone', saved: true };
	}
};
