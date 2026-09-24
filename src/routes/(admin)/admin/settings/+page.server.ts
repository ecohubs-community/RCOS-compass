import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/** Like a community's settings, the list is the page; the account panel opens first. */
export const load: PageServerLoad = () => {
	redirect(307, '/admin/settings/account');
};
