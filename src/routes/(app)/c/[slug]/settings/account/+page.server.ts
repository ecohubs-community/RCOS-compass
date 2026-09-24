import { accountPanel } from '$lib/server/http/account-panels';
import type { Actions, PageServerLoad } from './$types';

/**
 * The reader's own account, from inside a community. Every member can open it:
 * it is about them, not about the community whose settings these are.
 */
export const load: PageServerLoad = (event) => accountPanel.load(event);

export const actions: Actions = accountPanel.actions;
