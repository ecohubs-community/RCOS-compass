import { twoFactorPanel } from '$lib/server/http/account-panels';
import type { Actions, PageServerLoad } from './$types';

/** The reader's second factor, from inside a community. */
export const load: PageServerLoad = (event) => twoFactorPanel.load(event);

export const actions: Actions = twoFactorPanel.actions;
