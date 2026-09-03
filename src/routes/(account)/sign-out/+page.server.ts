import { redirect } from '@sveltejs/kit';
import { getAuth } from '$lib/server/auth/auth';
import { applyAuthCookies } from '$lib/server/auth/cookies';
import type { Actions, PageServerLoad } from './$types';

/**
 * Signing out is a POST, never a link.
 *
 * A GET that ends a session can be fired by any image tag on any page, which is
 * a nuisance rather than a breach — but it is the same reasoning that makes
 * every other state change a form action, and there is no reason to make an
 * exception for the one that logs people out.
 */
export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const response = await getAuth().api.signOut({ headers: request.headers, asResponse: true });
		// The library clears the cookie by setting an expired one; that instruction
		// has to reach the browser through SvelteKit's jar like any other.
		applyAuthCookies(response, cookies);
		redirect(303, '/sign-in');
	}
};
