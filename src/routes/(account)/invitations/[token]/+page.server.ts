import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { eq, sql } from 'drizzle-orm';
import * as v from 'valibot';
import * as m from '$lib/paraglide/messages';
import { links } from '$lib/links';
import { readAuth } from '$lib/server/auth/api';
import { getAuth } from '$lib/server/auth/auth';
import { applyAuthCookies } from '$lib/server/auth/cookies';
import { stampAbsoluteExpiry } from '$lib/server/auth/session';
import { systemClock } from '$lib/server/clock';
import { getDb, type Db } from '$lib/server/db';
import { user } from '$lib/server/db/schema/auth';
import { recordAudit } from '$lib/server/services/audit';
import {
	INVITATION_TTL_MS,
	acceptInvitation,
	inspectInvitation,
	type AcceptResult
} from '$lib/server/services/invitations';
import { fieldErrors } from '$lib/shared/schemas/auth';
import { NEW_PASSWORD_MIN, acceptInvitationSchema } from '$lib/shared/schemas/invitations';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * Accepting an invitation. `openspec/specs/invitations` — "the invited person
 * follows a valid invitation and signs in with that address".
 *
 * The service behind this has always been complete; what was missing was the
 * door. The email pointed here, and here answered 404, which meant the only way
 * into a community was the test seed.
 *
 * Two ways through, because an invited person is in one of two states:
 *
 *  - they have an account — sign in, come back, accept;
 *  - they do not — and this page is the only place in the product where an
 *    account can be made at all. That is deliberate rather than incidental:
 *    `docs/10-legal-and-operations.md` says not to onboard a community that is
 *    not personally known, so the instance stays invitation-only and there is no
 *    open sign-up form to find.
 *
 * The page is outside `(app)` for the same reason `/account/two-factor` is: it
 * belongs to a person who is not yet a member of anything, so no tenant has been
 * resolved and none can be.
 */
const day = 24 * 60 * 60_000;

/** Whether this address already has an account, compared the way sign-in does. */
function accountFor(db: Db, email: string) {
	return db
		.select()
		.from(user)
		.where(sql`lower(${user.email}) = ${email}`)
		.get();
}

/** Every refusal on the create form, in the shape `fieldErrors` produces. */
function formError(message: string): Record<string, string> {
	return { form: message };
}

export const load: PageServerLoad = ({ params, locals }) => {
	const db = getDb();
	const view = inspectInvitation(db, systemClock, params.token);

	/**
	 * Which of the two ways in to offer.
	 *
	 * Asking whether an account exists is not enumeration: the only address this
	 * page can be asked about is the one the token was mailed to, so the answer
	 * tells the holder something about themselves and about nobody else. Sign-in
	 * keeps its single answer for every failure precisely because *it* takes an
	 * address from whoever is typing.
	 */
	const hasAccount = view.kind === 'open' ? Boolean(accountFor(db, view.email)) : false;

	return {
		view,
		hasAccount,
		signedInAs: locals.user?.email ?? null,
		/** Back to this exact invitation once they have signed in. */
		signInHref: `${resolve('/(account)/sign-in')}?redirectTo=${encodeURIComponent(
			resolve('/(account)/invitations/[token]', { token: params.token })
		)}`,
		expiryDays: Math.round(INVITATION_TTL_MS / day),
		passwordMin: NEW_PASSWORD_MIN
	};
};

/**
 * What to do with the service's answer.
 *
 * Only `accepted` is a redirect. Every refusal returns to the page, whose `load`
 * runs again and re-reads the invitation — so the screen explains the current
 * state rather than the state the form was rendered against.
 */
function afterAccept(result: AcceptResult) {
	if (result.kind === 'accepted') redirect(303, links.dashboard(result.communitySlug));
	return fail(400, { error: m.invitation_error_failed() });
}

function signInFirst(event: RequestEvent): never {
	redirect(
		303,
		`${resolve('/(account)/sign-in')}?redirectTo=${encodeURIComponent(event.url.pathname)}`
	);
}

export const actions: Actions = {
	/** Someone already signed in, taking up the invitation. */
	accept: (event) => {
		const person = event.locals.user;
		if (!person) signInFirst(event);

		return afterAccept(
			acceptInvitation(getDb(), systemClock, { token: event.params.token, userId: person.id })
		);
	},

	/** Someone with no account, making one bound to the invited address. */
	create: async (event) => {
		const db = getDb();
		// Re-read rather than trusting the form's idea of the invitation: the page
		// may have been open since before it expired, and the address the account
		// is made for must come from the token, never from the request.
		const view = inspectInvitation(db, systemClock, event.params.token);
		if (view.kind !== 'open') return fail(400, { error: m.invitation_error_failed() });
		if (event.locals.user)
			return afterAccept(
				acceptInvitation(db, systemClock, {
					token: event.params.token,
					userId: event.locals.user.id
				})
			);

		const form = await event.request.formData();
		const parsed = v.safeParse(acceptInvitationSchema, {
			name: form.get('name'),
			password: form.get('password')
		});
		if (!parsed.success) {
			return fail(400, {
				name: String(form.get('name') ?? ''),
				errors: fieldErrors(parsed.issues)
			});
		}

		if (accountFor(db, view.email)) {
			return fail(400, {
				name: parsed.output.name,
				errors: formError(m.invitation_error_exists())
			});
		}

		const signUp = await getAuth().api.signUpEmail({
			body: { email: view.email, password: parsed.output.password, name: parsed.output.name },
			asResponse: true
		});
		const created = await readAuth<unknown>(signUp);
		if (!created.ok) {
			// The library's reason, for the log. The person is told the plain thing.
			event.locals.log.warn(
				{ status: created.status, code: created.code },
				'invited sign-up refused'
			);
			return fail(400, {
				name: parsed.output.name,
				errors: formError(m.invitation_error_failed())
			});
		}

		const account = accountFor(db, view.email);
		if (!account) {
			event.locals.log.error({ email: view.email }, 'sign-up reported success but wrote no user');
			return fail(400, {
				name: parsed.output.name,
				errors: formError(m.invitation_error_failed())
			});
		}

		/**
		 * The invitation is the verification.
		 *
		 * A single-use token that was delivered to this address, and has just been
		 * presented, proves control of the mailbox in exactly the way the
		 * verification email is there to prove it. Making them do it twice would
		 * send a second mail, to the same inbox, asking for the same proof — and
		 * `requireEmailVerification` would otherwise refuse the sign-in below and
		 * strand the person on the far side of the door they were invited through.
		 *
		 * (better-auth still sends its verification mail on sign-up, because that
		 * is configured for the flow that needs it. Following that link afterwards
		 * verifies an already-verified address and changes nothing.)
		 */
		db.update(user).set({ emailVerified: true }).where(eq(user.id, account.id)).run();

		const signIn = await getAuth().api.signInEmail({
			body: { email: view.email, password: parsed.output.password },
			asResponse: true
		});
		const session = await readAuth<{ token?: string }>(signIn);
		if (!session.ok) {
			event.locals.log.error(
				{ status: session.status, code: session.code },
				'invited sign-in failed'
			);
			return fail(400, {
				name: parsed.output.name,
				errors: formError(m.invitation_error_failed())
			});
		}

		applyAuthCookies(session.response, event.cookies);
		if (session.data.token) stampAbsoluteExpiry(db, session.data.token, systemClock.now());

		recordAudit(db, systemClock, {
			action: 'account.created',
			actorId: account.id,
			actorEmail: account.email,
			ip: event.getClientAddress(),
			userAgent: event.request.headers.get('user-agent'),
			meta: { via: 'invitation' }
		});

		return afterAccept(
			acceptInvitation(db, systemClock, { token: event.params.token, userId: account.id })
		);
	}
};
