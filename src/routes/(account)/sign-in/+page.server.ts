import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { getAuth } from '$lib/server/auth/auth';
import { readAuth } from '$lib/server/auth/api';
import { applyAuthCookies } from '$lib/server/auth/cookies';
import { stampAbsoluteExpiry } from '$lib/server/auth/session';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { askedTarget } from '$lib/server/http/redirect-target';
import { recordAudit } from '$lib/server/services/audit';
import { landingFor } from '$lib/server/services/tenancy';
import { fieldErrors, signInSchema } from '$lib/shared/schemas/auth';
import * as m from '$lib/paraglide/messages';
import type { Actions, PageServerLoad } from './$types';

/**
 * Sign-in. docs/04-security.md §3.
 *
 * One message for every failure. A wrong password, an address with no account
 * and an unverified address all answer the same way, because any difference
 * between them is a list of who has an account here — and this instance's users
 * are members of named communities.
 *
 * In the browser's language (`signInLocale`): there is no community yet to ask.
 *
 * Without a destination asked for, the person lands where they work
 * (`landingFor`). The form carries the asked-for destination, or nothing, so the
 * difference survives the round trip.
 */
export const load: PageServerLoad = ({ locals, url }) => {
	const asked = askedTarget(url.searchParams.get('redirectTo'));
	if (locals.user) redirect(303, asked ?? landingFor(getDb(), locals.user.id));
	return { redirectTo: asked ?? '' };
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const asked = askedTarget(String(form.get('redirectTo') ?? '') || null);

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
		const outcome = await readAuth<{
			token?: string;
			twoFactorRedirect?: boolean;
			user?: { id: string };
		}>(response);

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
			const errors: Record<string, string> = { form: m.sign_in_refused() };
			return fail(400, { email, errors });
		}

		// The session — or, when a second factor is enrolled, the challenge cookie.
		applyAuthCookies(outcome.response, cookies);

		if (outcome.data?.twoFactorRedirect) {
			const next = new URL('/sign-in/two-factor', url);
			if (asked) next.searchParams.set('redirectTo', asked);
			redirect(303, `${next.pathname}${next.search}`);
		}

		if (outcome.data?.token) {
			stampAbsoluteExpiry(getDb(), outcome.data.token, systemClock.now());
		}

		const userId = outcome.data?.user?.id;
		redirect(303, asked ?? (userId ? landingFor(getDb(), userId) : '/'));
	}
};
