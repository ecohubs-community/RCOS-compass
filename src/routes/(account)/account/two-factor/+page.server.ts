import { fail, redirect } from '@sveltejs/kit';
import * as v from 'valibot';
import { applyAuthCookies } from '$lib/server/auth/cookies';
import { stampAbsoluteExpiry } from '$lib/server/auth/session';
import {
	beginEnrolment,
	confirmEnrolment,
	manualEntryKey,
	removeEnrolment,
	twoFactorState
} from '$lib/server/auth/two-factor';
import { systemClock } from '$lib/server/clock';
import { getConfig, isPlatformAdmin } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { recordAudit } from '$lib/server/services/audit';
import { passwordSchema, totpCodeSchema } from '$lib/shared/schemas/auth';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * Enrolling a second factor. openspec `authentication` — "Platform admins must
 * hold a second factor".
 *
 * This page is deliberately outside `(app)`: it belongs to a person, not to a
 * community, and a platform admin who has not enrolled yet is sent here *before*
 * any community is resolved. It is also the reason the admin guard redirects
 * rather than refusing — without a way in, the requirement is a locked door with
 * no key cut.
 *
 * Enrolment is two steps on purpose. Step one mints a secret and leaves it
 * unverified; step two proves a code from the app matches it. An enrolment
 * abandoned halfway locks nobody out, because an unverified factor is not one.
 */
const WRONG_PASSWORD = 'That password was not accepted.';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, `/sign-in?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	return {
		email: locals.user.email,
		state: twoFactorState(locals.user),
		/**
		 * Whether this account is *required* to hold a factor, so the page can say
		 * why. Told only to the person whose address it is.
		 */
		required: isPlatformAdmin(locals.user.email, locals.user.emailVerified, getConfig().adminEmails)
	};
};

function requireUser(event: RequestEvent) {
	if (!event.locals.user) redirect(303, '/sign-in?redirectTo=%2Faccount%2Ftwo-factor');
	return event.locals.user;
}

export const actions: Actions = {
	/** Mint a secret and recovery codes. Nothing is required of the user yet. */
	begin: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const state = twoFactorState(user);

		let password: string | undefined;
		if (state.requiresPassword) {
			const parsed = v.safeParse(passwordSchema, form.get('password'));
			if (!parsed.success) return fail(400, { step: 'begin', error: parsed.issues[0]!.message });
			password = parsed.output;
		}

		const outcome = await beginEnrolment(event.request.headers, password);
		if (!outcome.ok) {
			return fail(400, { step: 'begin', error: WRONG_PASSWORD });
		}

		return {
			step: 'confirm' as const,
			totpURI: outcome.data.totpURI,
			manualKey: manualEntryKey(outcome.data.totpURI),
			// Shown once. They are not recoverable — starting again is the remedy.
			backupCodes: outcome.data.backupCodes
		};
	},

	/** Prove the app holds the same secret. Only now is the factor real. */
	confirm: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();

		const parsed = v.safeParse(totpCodeSchema, form.get('code'));
		if (!parsed.success) {
			return fail(400, { step: 'confirm', error: parsed.issues[0]!.message });
		}

		const outcome = await confirmEnrolment(event.request.headers, parsed.output);
		if (!outcome.ok) {
			return fail(400, {
				step: 'confirm',
				error: 'That code did not match. Codes change every 30 seconds — try the current one.'
			});
		}

		// Verifying rotates the session; the new one needs its own ceiling.
		applyAuthCookies(outcome.response, event.cookies);
		if (outcome.data?.token) {
			stampAbsoluteExpiry(getDb(), outcome.data.token, systemClock.now());
		}

		recordAudit(getDb(), systemClock, {
			action: 'auth.two_factor.enrolled',
			actorId: user.id,
			actorEmail: user.email,
			ip: event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent')
		});

		redirect(303, '/account/two-factor?enrolled=1');
	},

	/** Remove it. An admin who does this loses the console until they re-enrol. */
	remove: async (event) => {
		const user = requireUser(event);
		const form = await event.request.formData();
		const state = twoFactorState(user);

		let password: string | undefined;
		if (state.requiresPassword) {
			const parsed = v.safeParse(passwordSchema, form.get('password'));
			if (!parsed.success) return fail(400, { step: 'remove', error: parsed.issues[0]!.message });
			password = parsed.output;
		}

		const outcome = await removeEnrolment(event.request.headers, password);
		if (!outcome.ok) return fail(400, { step: 'remove', error: WRONG_PASSWORD });

		applyAuthCookies(outcome.response, event.cookies);
		recordAudit(getDb(), systemClock, {
			action: 'auth.two_factor.removed',
			actorId: user.id,
			actorEmail: user.email,
			ip: event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent')
		});

		redirect(303, '/account/two-factor');
	}
};
