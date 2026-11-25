import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { sql } from 'drizzle-orm';
import * as v from 'valibot';
import * as m from '$lib/paraglide/messages';
import { links } from '$lib/links';
import { getAuth } from '$lib/server/auth/auth';
import { createAccountWithoutPassword, hasPassword } from '$lib/server/auth/join-account';
import { systemClock } from '$lib/server/clock';
import { getDb, type Db } from '$lib/server/db';
import { user } from '$lib/server/db/schema/auth';
import { recordAudit } from '$lib/server/services/audit';
import { inspectJoinLink } from '$lib/server/services/join-link';
import { joinQueueIsFull, joinStatusOf, requestToJoin } from '$lib/server/services/join-requests';
import { fieldErrors } from '$lib/shared/schemas/auth';
import { joinRequestSchema } from '$lib/shared/schemas/invitations';
import type { Actions, PageServerLoad } from './$types';

/**
 * A community's join link. `openspec/changes/pilot-blockers` D4, the
 * `join-link` spec.
 *
 * Following it makes at most a *request*: nobody here becomes a member, and
 * nothing of the community is shown but its name. A steward decides, once the
 * address behind the request is proven by the ordinary verification mail.
 *
 * The signed-out form answers the same way whatever is true of the address it
 * is given — "check your inbox" — because this page is reachable by anyone the
 * link was passed to, and a different answer for an address that has an account
 * would make it a way to find out who has one.
 *
 * There is no password on the form. Anyone holding the link could type
 * somebody else's address, and if they chose the password too they would know
 * the password of the account that address goes on to verify. The password is
 * chosen on `/join`, by the person the verification mail signed in.
 *
 * Outside `(app)` for the reason the invitation page is: the person is not a
 * member of anything yet, so there is no tenant to resolve. The token alone
 * names the community.
 */

/** The account behind an address, compared the way sign-in compares it. */
function accountFor(db: Db, email: string) {
	return db
		.select()
		.from(user)
		.where(sql`lower(${user.email}) = ${email}`)
		.get();
}

/** A refusal of the whole form, in the shape `fieldErrors` produces. */
function failed(): Record<string, string> {
	return { form: m.invitation_error_failed() };
}

export const load: PageServerLoad = ({ params, locals }) => {
	const db = getDb();
	const target = inspectJoinLink(db, params.token);
	if (target.kind === 'dead') return { state: 'dead' as const };

	let state: 'form' | 'ask' | 'waiting' = 'form';
	if (locals.user) {
		// An account made here that has not chosen its password yet does that first.
		if (!hasPassword(db, locals.user.id)) redirect(303, resolve('/(account)/join'));
		const status = joinStatusOf(db, target.communityId, locals.user.id);
		if (status === 'joined') redirect(303, links.dashboard(target.communitySlug));
		state = status === 'waiting' ? 'waiting' : 'ask';
	}

	return {
		state,
		communityName: target.communityName,
		signedInAs: locals.user?.email ?? null,
		/** Back to this link once they have signed in. */
		signInHref: `${resolve('/(account)/sign-in')}?redirectTo=${encodeURIComponent(
			resolve('/(account)/join/[token]', { token: params.token })
		)}`
	};
};

export const actions: Actions = {
	/** Someone signed in, asking with the account they have. It is verified. */
	ask: (event) => {
		const person = event.locals.user;
		if (!person) {
			redirect(
				303,
				`${resolve('/(account)/sign-in')}?redirectTo=${encodeURIComponent(event.url.pathname)}`
			);
		}
		const outcome = requestToJoin(getDb(), systemClock, {
			token: event.params.token,
			userId: person.id
		});
		if (outcome.kind === 'joined') redirect(303, links.dashboard(outcome.communitySlug));
		if (outcome.kind === 'full') return fail(409, { full: outcome.communityName });
		// Dead, requested or waiting: the page reloads and reads the current state.
		return { asked: true };
	},

	/**
	 * Someone signed out. Three cases, one answer:
	 *  - no account: one is made — unverified, with no password — and a request
	 *    written; a verification link that lands on `/join` is mailed;
	 *  - an account never verified: a fresh verification mail, and a request;
	 *  - a verified account: a sign-in link back to this page, and nothing else —
	 *    their own account asks once signed in.
	 */
	create: async (event) => {
		const db = getDb();
		const target = inspectJoinLink(db, event.params.token);
		// Re-read: the link may have been replaced while the page was open.
		if (target.kind === 'dead') return fail(410, { dead: true });

		const form = await event.request.formData();
		const parsed = v.safeParse(joinRequestSchema, {
			name: form.get('name'),
			email: form.get('email')
		});
		if (!parsed.success) {
			return fail(400, {
				name: String(form.get('name') ?? ''),
				email: String(form.get('email') ?? ''),
				errors: fieldErrors(parsed.issues)
			});
		}
		const { name, email } = parsed.output;

		if (joinQueueIsFull(db, target.communityId)) {
			return fail(409, { full: target.communityName });
		}

		const auth = getAuth();
		const existing = accountFor(db, email);
		try {
			if (!existing) {
				// No password: see the note at the top of this file.
				const account = await createAccountWithoutPassword({ email, name });
				recordAudit(db, systemClock, {
					action: 'account.created',
					actorId: account.id,
					actorEmail: account.email,
					ip: event.getClientAddress(),
					userAgent: event.request.headers.get('user-agent'),
					meta: { via: 'join_link' }
				});
				requestToJoin(db, systemClock, { token: event.params.token, userId: account.id });
				await auth.api.sendVerificationEmail({
					body: { email, callbackURL: resolve('/(account)/join') }
				});
			} else if (!existing.emailVerified) {
				requestToJoin(db, systemClock, { token: event.params.token, userId: existing.id });
				await auth.api.sendVerificationEmail({
					body: { email, callbackURL: resolve('/(account)/join') }
				});
			} else {
				await auth.api.signInMagicLink({
					body: {
						email,
						callbackURL: resolve('/(account)/join/[token]', { token: event.params.token })
					},
					headers: event.request.headers
				});
			}
		} catch (problem) {
			event.locals.log.error(
				{ err: problem instanceof Error ? problem.message : String(problem) },
				'join-link request failed'
			);
			return fail(400, { name, email, errors: failed() });
		}

		return { checkInbox: email, communityName: target.communityName };
	}
};
