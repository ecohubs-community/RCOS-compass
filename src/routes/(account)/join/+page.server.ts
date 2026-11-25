import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import * as v from 'valibot';
import { hasPassword, setFirstPassword } from '#lib/server/auth/join-account.ts';
import { getDb } from '#lib/server/db/index.ts';
import { openRequestsOf } from '#lib/server/services/join-requests.ts';
import { landingFor } from '#lib/server/services/tenancy.ts';
import { fieldErrors } from '#lib/shared/schemas/auth.ts';
import { NEW_PASSWORD_MIN, joinPasswordSchema } from '#lib/shared/schemas/invitations.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Where the verification mail of a join-link sign-up lands.
 * `openspec/changes/pilot-blockers` D4.
 *
 * Two jobs. First, an account made through a join link has no password — the
 * form did not ask for one, because whoever typed the address may not own it —
 * so the person the verification mail just signed in chooses it here. Then, the
 * person's own open requests: not the link's own page, because a steward may
 * replace the link while someone is confirming their address, and they must
 * still find out they are waiting rather than read "this link does not work".
 * Nothing of any community is shown here but its name.
 */
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) {
		redirect(303, `${resolve('/(account)/sign-in')}?redirectTo=${encodeURIComponent('/join')}`);
	}
	const db = getDb();
	const needsPassword = !hasPassword(db, locals.user.id);
	const waiting = openRequestsOf(db, locals.user.id);
	if (!needsPassword && waiting.length === 0) redirect(303, landingFor(db, locals.user.id));
	return { needsPassword, waiting, passwordMin: NEW_PASSWORD_MIN };
};

export const actions: Actions = {
	/** The first password, by the signed-in owner of the address. Never a second. */
	password: async ({ request, locals }) => {
		if (!locals.user) {
			redirect(303, `${resolve('/(account)/sign-in')}?redirectTo=${encodeURIComponent('/join')}`);
		}
		const form = await request.formData();
		const parsed = v.safeParse(joinPasswordSchema, { password: form.get('password') });
		if (!parsed.success) return fail(400, { errors: fieldErrors(parsed.issues) });
		await setFirstPassword(getDb(), locals.user.id, parsed.output.password);
		return { passwordSet: true };
	}
};
