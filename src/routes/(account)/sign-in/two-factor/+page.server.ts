import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { applyAuthCookies } from '$lib/server/auth/cookies';
import { stampAbsoluteExpiry } from '$lib/server/auth/session';
import {
	answerChallengeWithBackupCode,
	answerChallengeWithCode,
	TWO_FACTOR_CHALLENGE_COOKIE
} from '$lib/server/auth/two-factor';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { askedTarget } from '$lib/server/http/redirect-target';
import { landingFor } from '$lib/server/services/tenancy';
import { recordAudit } from '$lib/server/services/audit';
import { backupCodeSchema, totpCodeSchema } from '$lib/shared/schemas/auth';
import * as m from '$lib/paraglide/messages';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * The second half of a sign-in. The password has already been accepted and
 * better-auth is holding the half-finished sign-in in a short-lived cookie; no
 * session exists yet, so nothing here reads `locals.user` for identity.
 *
 * The failure message does not distinguish a wrong code from an expired
 * challenge — that difference is only useful to someone guessing.
 */

export const load: PageServerLoad = ({ locals, url, cookies }) => {
	const asked = askedTarget(url.searchParams.get('redirectTo'));
	// Already through: nothing left to challenge.
	if (locals.user) redirect(303, asked ?? landingFor(getDb(), locals.user.id));
	// No challenge in flight — arriving here directly means starting again.
	if (!cookies.get(TWO_FACTOR_CHALLENGE_COOKIE)) redirect(303, '/sign-in');
	return { redirectTo: asked ?? '' };
};

/** The two actions differ only in which code they carry. */
async function answer(kind: 'totp' | 'backup', event: RequestEvent) {
	const { request, cookies, getClientAddress } = event;
	const form = await request.formData();
	const asked = askedTarget(String(form.get('redirectTo') ?? '') || null);

	const parsed = v.safeParse(kind === 'totp' ? totpCodeSchema : backupCodeSchema, form.get('code'));
	if (!parsed.success) {
		return fail(400, { mode: kind, error: parsed.issues[0]!.message });
	}

	const outcome =
		kind === 'totp'
			? await answerChallengeWithCode(request.headers, parsed.output)
			: await answerChallengeWithBackupCode(request.headers, parsed.output);

	if (!outcome.ok) {
		recordAudit(getDb(), systemClock, {
			action: 'auth.signin.failed',
			ip: getClientAddress(),
			userAgent: request.headers.get('user-agent'),
			meta: { stage: 'two_factor', method: kind, reason: outcome.code ?? 'unknown' }
		});
		return fail(400, { mode: kind, error: m.sign_in_code_refused() });
	}

	applyAuthCookies(outcome.response, cookies);
	if (outcome.data?.token) stampAbsoluteExpiry(getDb(), outcome.data.token, systemClock.now());

	const userId = outcome.data?.user?.id;
	redirect(303, asked ?? (userId ? landingFor(getDb(), userId) : '/'));
}

export const actions: Actions = {
	code: (event) => answer('totp', event),
	recovery: (event) => answer('backup', event)
};
