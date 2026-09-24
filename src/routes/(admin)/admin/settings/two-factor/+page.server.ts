import { adminActions, requirePlatformAdmin } from '$lib/server/auth/admin';
import { twoFactorPanel } from '$lib/server/http/account-panels';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = (event) => {
	requirePlatformAdmin(event.locals.user, event.url.pathname);
	return twoFactorPanel.load(event);
};

export const actions: Actions = adminActions(twoFactorPanel.actions);
