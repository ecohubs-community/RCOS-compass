import { fail } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import type { Role } from '$lib/server/db/schema/tenancy';
import {
	endMembership,
	listFormerMembers,
	listMembers,
	setMemberRole
} from '$lib/server/services/members';
import type { Actions, PageServerLoad } from './$types';

/**
 * Who is in this community. `openspec/specs/tenancy/spec.md`.
 *
 * The services have existed since P1 and had no screen, which meant a community
 * could not see its own register: not who was in it, not who held which role,
 * and not who had left. It surfaced while closing P7 — the erasure spec wanted
 * to assert that an erased person reads as `Former member (M-0142)` on a member
 * list, and there was no member list to assert it against.
 *
 * Readable by every member and changeable only by a steward, which is the same
 * line the rest of the product draws: knowing who you are governing with is not
 * a privilege, and deciding it is.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	return {
		members: listMembers(ctx),
		former: listFormerMembers(ctx),
		/** So the reader can find themselves in a list of twenty-seven. */
		you: ctx.membership.id,
		can: { manage: ctxCan(ctx, 'member.manage') }
	};
};

const ROLES: readonly string[] = ['steward', 'member'];

/**
 * The refusals `members.ts` makes are things a steward needs to read — "transfer
 * ownership first" is an instruction, not an error — so they come back as form
 * state rather than as an error page that loses the list.
 */
function refusal(problem: unknown): { status: 404 | 409; message: string } {
	const http = problem as { status?: number; body?: { message?: string } };
	if (http.status === 404 || http.status === 409) {
		return { status: http.status, message: http.body?.message ?? '' };
	}
	throw problem;
}

export const actions: Actions = {
	role: async (event) => {
		const form = await event.request.formData();
		const role = String(form.get('role') ?? '');
		if (!ROLES.includes(role)) return fail(400, { error: 'Choose a role.' });

		try {
			setMemberRole(event.locals.ctx!, String(form.get('id') ?? ''), role as Role);
		} catch (problem) {
			const refused = refusal(problem);
			return fail(refused.status, { error: refused.message });
		}
		return { saved: true };
	},

	end: async (event) => {
		const form = await event.request.formData();
		try {
			endMembership(event.locals.ctx!, String(form.get('id') ?? ''));
		} catch (problem) {
			const refused = refusal(problem);
			return fail(refused.status, { error: refused.message });
		}
		return { ended: true };
	}
};
