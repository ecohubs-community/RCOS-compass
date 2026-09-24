import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
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
import { run } from '$lib/server/http/form-action';
import { erasureSummary, renamePerson } from '$lib/server/services/account';
import { recordAudit } from '$lib/server/services/audit';
import { erasePerson } from '$lib/server/services/erasure';
import { setPersonTimeZone, timeZoneChoices } from '$lib/server/services/time-zone';
import { passwordSchema, totpCodeSchema } from '$lib/shared/schemas/auth';

/**
 * The three panels about the person rather than the community — Account,
 * Two-factor authentication, Time zone — shared by the two places they are
 * shown: a community's settings, and the admin console's for an instance admin
 * who may belong to no community at all.
 *
 * Loads and actions only; each route still decides who may reach it. Every one
 * of them acts on `locals.user` and nothing else: no id is ever read from a form.
 */

type Event = RequestEvent;

function requireUser(event: Event) {
	if (!event.locals.user) {
		redirect(303, `/sign-in?redirectTo=${encodeURIComponent(event.url.pathname)}`);
	}
	return event.locals.user;
}

export const accountPanel = {
	load: (event: Event) => {
		const user = requireUser(event);
		return { email: user.email, name: user.name, ...erasureSummary(getDb(), user.id) };
	},

	actions: {
		rename: async (event: Event) => {
			const user = requireUser(event);
			const form = await event.request.formData();
			return run('name', () => {
				// Read again by the page rendered in this same response: without it a
				// form posted without JavaScript shows the old name right after saving.
				user.name = renamePerson(getDb(), user.id, form.get('name'), systemClock.now());
			});
		},

		erase: async (event: Event) => {
			const user = requireUser(event);
			const form = await event.request.formData();
			// Typed confirmation, like every other irreversible act in the product.
			if (
				String(form.get('confirm') ?? '')
					.trim()
					.toLowerCase() !== 'erase'
			) {
				return fail(400, { step: 'erase', error: 'Type erase to confirm.' });
			}

			try {
				erasePerson(getDb(), { userId: user.id, actorId: user.id, now: systemClock.now() });
			} catch (problem) {
				const http = problem as { status?: number; body?: { message?: string } };
				if (http.status === 409) {
					return fail(409, { step: 'erase', error: http.body?.message ?? '' });
				}
				throw problem;
			}

			// Their session is gone with everything else; the sign-out route clears the
			// cookie so the browser is not left holding a token for nothing.
			redirect(303, '/sign-out');
		}
	}
};

export const timeZonePanel = {
	load: (event: Event) => ({
		timeZone: requireUser(event).timeZone,
		timeZones: timeZoneChoices()
	}),

	actions: {
		/** The zone the person chose from the list, or "use this device's". */
		setTimeZone: async (event: Event) => {
			const user = requireUser(event);
			const form = await event.request.formData();
			const zone = String(form.get('timeZone') ?? '');
			return run('timeZone', () => {
				setPersonTimeZone(getDb(), user.id, zone, systemClock.now());
				// As with the name: the page rendered in this response reads it again.
				user.timeZone = zone;
			});
		}
	}
};

/**
 * Enrolling a second factor. openspec `authentication` — "Platform admins must
 * hold a second factor".
 *
 * Enrolment is two steps on purpose. Step one mints a secret and leaves it
 * unverified; step two proves a code from the app matches it. An enrolment
 * abandoned halfway locks nobody out, because an unverified factor is not one.
 */
const WRONG_PASSWORD = 'That password was not accepted.';

export const twoFactorPanel = {
	load: (event: Event) => {
		const user = requireUser(event);
		return {
			email: user.email,
			state: twoFactorState(user),
			/**
			 * Whether this account is *required* to hold a factor, so the page can say
			 * why. Told only to the person whose address it is.
			 */
			required: isPlatformAdmin(user.email, user.emailVerified, getConfig().adminEmails)
		};
	},

	actions: {
		/** Mint a secret and recovery codes. Nothing is required of the user yet. */
		begin: async (event: Event) => {
			const user = requireUser(event);
			const form = await event.request.formData();
			const state = twoFactorState(user);

			let password: string | undefined;
			if (state.requiresPassword) {
				const parsed = v.safeParse(passwordSchema, form.get('password'));
				if (!parsed.success) {
					return fail(400, { step: 'begin', error: parsed.issues[0]!.message });
				}
				password = parsed.output;
			}

			const outcome = await beginEnrolment(event.request.headers, password);
			if (!outcome.ok) return fail(400, { step: 'begin', error: WRONG_PASSWORD });

			return {
				step: 'confirm' as const,
				totpURI: outcome.data.totpURI,
				manualKey: manualEntryKey(outcome.data.totpURI),
				// Shown once. They are not recoverable — starting again is the remedy.
				backupCodes: outcome.data.backupCodes
			};
		},

		/** Prove the app holds the same secret. Only now is the factor real. */
		confirm: async (event: Event) => {
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

			redirect(303, `${event.url.pathname}?enrolled=1`);
		},

		/** Remove it. An admin who does this loses the console until they re-enrol. */
		remove: async (event: Event) => {
			const user = requireUser(event);
			const form = await event.request.formData();
			const state = twoFactorState(user);

			let password: string | undefined;
			if (state.requiresPassword) {
				const parsed = v.safeParse(passwordSchema, form.get('password'));
				if (!parsed.success) {
					return fail(400, { step: 'remove', error: parsed.issues[0]!.message });
				}
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

			redirect(303, event.url.pathname);
		}
	}
};
