import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getAuth } from '$lib/server/auth/auth';
import { readAuth } from '$lib/server/auth/api';
import { applyAuthCookies } from '$lib/server/auth/cookies';
import { stampAbsoluteExpiry } from '$lib/server/auth/session';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { safeRedirectTarget } from '$lib/server/http/redirect-target';
import { recordAudit } from '$lib/server/services/audit';
import { fieldErrors, signInSchema } from '$lib/shared/schemas/auth';
import type { Actions, PageServerLoad } from './$types';

/**
 * Sign-in. docs/04-security.md §3.
 *
 * One message for every failure. A wrong password, an address with no account
 * and an unverified address all answer the same way, because any difference
 * between them is a list of who has an account here — and this instance's users
 * are members of named communities.
 */
const REFUSED = 'Those details did not match an account. Check them and try again.';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeRedirectTarget(url.searchParams.get('redirectTo')));
	return { redirectTo: safeRedirectTarget(url.searchParams.get('redirectTo')) };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const target = safeRedirectTarget(String(form.get('redirectTo') ?? '') || null);

		const parsed = v.safeParse(signInSchema, {
			email: form.get('email'),
			password: form.get('password')
		});
		if (!parsed.success) {
			return fail(400, {
				email: String(form.get('email') ?? ''),
				errors: fieldErrors(parsed.issues)
			});
		}

		const { email, password } = parsed.output;
		const response = await getAuth().api.signInEmail({
			headers: request.headers,
			body: { email, password },
			asResponse: true
		});
		const outcome = await readAuth<{ token?: string; twoFactorRedirect?: boolean }>(response);

		if (!outcome.ok) {
			recordAudit(getDb(), systemClock, {
				action: 'auth.signin.failed',
				actorEmail: email,
				ip: getClientAddress(),
				userAgent: request.headers.get('user-agent'),
				// The library's reason, for an operator reading the trail. The
				// person at the keyboard is told only that it did not match.
				meta: { reason: outcome.code ?? 'unknown' }
			});
			const errors: Record<string, string> = { form: REFUSED };
			return fail(400, { email, errors });
		}

		// The session — or, when a second factor is enrolled, the challenge cookie.
		applyAuthCookies(outcome.response, cookies);

		if (outcome.data?.twoFactorRedirect) {
			const next = new URL('/sign-in/two-factor', url);
			if (target !== '/') next.searchParams.set('redirectTo', target);
			redirect(303, `${next.pathname}${next.search}`);
		}

		if (outcome.data?.token) {
			stampAbsoluteExpiry(getDb(), outcome.data.token, systemClock.now());
		}

		redirect(303, target);
	}
};
