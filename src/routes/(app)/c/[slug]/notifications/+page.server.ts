import { redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { run } from '$lib/server/http/form-action';
import {
	listNotificationItems,
	markAllRead,
	openNotification,
	unreadCount
} from '$lib/server/services/notifications';
import { targetHref } from '$lib/notifications/href';
import { links } from '$lib/links';
import type { Actions, PageServerLoad } from './$types';

/**
 * A member's notifications in this community. UI spec §4.11;
 * `openspec/changes/notifications-page`.
 *
 * Reading is a load and nothing more: opening the page, or a browser preloading
 * it, marks nothing read. The two ways anything becomes read are the form
 * actions below, and both work in a suspended community — reading a
 * notification changes nothing anyone agreed.
 */
export const load: PageServerLoad = ({ locals, url }) => {
	const ctx = locals.ctx!;
	const db = getDb();
	return {
		// Where each leads is worked out again when it is opened, so none of it is sent.
		items: listNotificationItems(ctx, { db }).map(({ target: _target, ...item }) => item),
		unreadTotal: unreadCount(ctx, { db }),
		/** Set by `open` when the notification led somewhere no longer there. */
		gone: url.searchParams.get('gone'),
		now: ctx.now()
	};
};

export const actions: Actions = {
	/**
	 * Mark one read, then go to it — or back here saying it is gone. A POST, so a
	 * preloaded link can never read a member's notifications for them.
	 */
	open: async (event) => {
		const form = await event.request.formData();
		const id = String(form.get('id') ?? '');
		const target = openNotification(event.locals.ctx!, id, { db: getDb() });
		const slug = event.params.slug;
		redirect(
			303,
			target
				? targetHref(slug, target)
				: `${links.notifications(slug)}?gone=${encodeURIComponent(id)}`
		);
	},

	readAll: async (event) => run('readAll', () => markAllRead(event.locals.ctx!, { db: getDb() }))
};
