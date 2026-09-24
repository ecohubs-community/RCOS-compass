import { adminActions, requirePlatformAdmin } from '$lib/server/auth/admin';
import { accountPanel } from '$lib/server/http/account-panels';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	requirePlatformAdmin(event.locals.user, event.url.pathname);
	return accountPanel.load(event);
};

export const actions: Actions = adminActions(accountPanel.actions);
