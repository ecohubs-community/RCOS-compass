import { fail } from '@sveltejs/kit';
import { ctxCan } from '#lib/server/auth/guard.ts';
import { getConfig } from '#lib/server/config.ts';
import type { Role } from '#lib/server/db/schema/tenancy.ts';
import { getLogger } from '#lib/server/logger.ts';
import {
	getMailTransport,
	invitationMessage,
	invitationUrl,
	joinDeclinedMessage,
	joinLinkUrl
} from '#lib/server/mail/index.ts';
import {
	INVITES_PER_STEWARD_PER_DAY,
	inviteMembers,
	listInvitations,
	resendInvitation,
	revokeInvitation
} from '#lib/server/services/invitations.ts';
import {
	joinLinkOf,
	replaceJoinLink,
	turnOffJoinLink,
	turnOnJoinLink
} from '#lib/server/services/join-link.ts';
import {
	admitJoinRequest,
	declineJoinRequest,
	listJoinRequests
} from '#lib/server/services/join-requests.ts';
import {
	endMembership,
	listFormerMembers,
	listMembers,
	setMemberRole
} from '#lib/server/services/members.ts';
import type { Locale } from '#lib/paraglide/runtime.js';
import type { Ctx } from '#lib/server/auth/guard.ts';
import type { Actions, PageServerLoad } from './$types';

/**
 * Who is in this community, and — for a steward — who is on the way in.
 * `openspec/specs/tenancy/spec.md`, `openspec/changes/pilot-blockers`.
 *
 * The services have existed since P1 and had no screen, which meant a community
 * could not see its own register: not who was in it, not who held which role,
 * and not who had left. It surfaced while closing P7 — the erasure spec wanted
 * to assert that an erased person reads as `Former member (M-0142)` on a member
 * list, and there was no member list to assert it against.
 *
 * Bringing people in had the same story: `inviteMember` was tested and nothing
 * a steward could reach called it. The invitations, the join link and the
 * requests it makes are a steward's; a member sees the list and nothing else.
 *
 * Readable by every member and changeable only by a steward, which is the same
 * line the rest of the product draws: knowing who you are governing with is not
 * a privilege, and deciding it is.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const invites = ctxCan(ctx, 'member.invite');
	const now = ctx.now();
	const link = invites ? joinLinkOf(ctx) : null;
	return {
		members: listMembers(ctx),
		former: listFormerMembers(ctx),
		/** So the reader can find themselves in a list of twenty-seven. */
		you: ctx.membership.id,
		can: { manage: ctxCan(ctx, 'member.manage'), invite: invites },
		invitations: ctxCan(ctx, 'member.manage')
			? listInvitations(ctx).map((row) => ({
					id: row.id,
					email: row.email,
					role: row.role,
					sentAt: row.createdAt.getTime(),
					expired: row.expiresAt.getTime() <= now
				}))
			: [],
		joinLink: link ? joinLinkUrl(getConfig().PUBLIC_APP_URL, link.token) : null,
		requests: invites ? listJoinRequests(ctx) : []
	};
};

const ROLES: readonly string[] = ['steward', 'member'];

/**
 * The refusals the services make are things a steward needs to read — "transfer
 * ownership first" is an instruction, not an error — so they come back as form
 * state rather than as an error page that loses the list.
 */
function refusal(problem: unknown): { status: 400 | 404 | 409; message: string } {
	const http = problem as { status?: number; body?: { message?: string } };
	if (http.status === 400 || http.status === 404 || http.status === 409) {
		return { status: http.status, message: http.body?.message ?? '' };
	}
	throw problem;
}

/**
 * Send one invitation's mail, after its row is committed. A failure is the
 * steward's to know about and the link is never shown instead (docs/04 §3): a
 * link pasted into a chat window is a credential in a chat window.
 */
async function mailInvitation(ctx: Ctx, email: string, token: string): Promise<boolean> {
	const url = invitationUrl(getConfig().PUBLIC_APP_URL, ctx.community.slug, token);
	try {
		await getMailTransport().send({
			...invitationMessage(email, ctx.community.name, url),
			kind: 'invitation',
			communityId: ctx.community.id
		});
		return true;
	} catch (problem) {
		getLogger().error(
			{
				communityId: ctx.community.id,
				err: problem instanceof Error ? problem.message : String(problem)
			},
			'invitation not sent'
		);
		return false;
	}
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
	},

	/** A pasted list, one outcome per address. D1. */
	invite: async (event) => {
		const ctx = event.locals.ctx!;
		const form = await event.request.formData();
		const addresses = String(form.get('addresses') ?? '');
		const role = String(form.get('role') ?? 'member');
		if (!ROLES.includes(role))
			return fail(400, { step: 'invite', addresses, error: 'Choose a role.' });

		let outcomes;
		try {
			outcomes = inviteMembers(ctx, { addresses, role: role as 'steward' | 'member' });
		} catch (problem) {
			const refused = refusal(problem);
			return fail(refused.status, { step: 'invite', addresses, error: refused.message });
		}

		// All at once and awaited together: fifty mails one after another, on a
		// slow mail server, outlast a reverse proxy's timeout — and the steward
		// would lose the very list of outcomes they need, with the invitations
		// already made.
		const results = await Promise.all(
			outcomes.map(async (entry) => {
				if (entry.outcome !== 'invited') return { address: entry.address, outcome: entry.outcome };
				const sent = await mailInvitation(ctx, entry.address, entry.token);
				return { address: entry.address, outcome: sent ? 'invited' : 'mail_failed' };
			})
		);
		return { step: 'invite', results, limit: INVITES_PER_STEWARD_PER_DAY };
	},

	resend: async (event) => {
		const ctx = event.locals.ctx!;
		const form = await event.request.formData();
		let created;
		try {
			created = resendInvitation(ctx, String(form.get('id') ?? ''));
		} catch (problem) {
			const refused = refusal(problem);
			return fail(refused.status, { error: refused.message });
		}
		const sent = await mailInvitation(ctx, created.invitation.email, created.token);
		return sent ? { resent: true } : fail(502, { resendFailed: true });
	},

	withdraw: async (event) => {
		const form = await event.request.formData();
		try {
			revokeInvitation(event.locals.ctx!, String(form.get('id') ?? ''));
		} catch (problem) {
			const refused = refusal(problem);
			return fail(refused.status, { error: refused.message });
		}
		return { withdrawn: true };
	},

	linkOn: async (event) => {
		try {
			turnOnJoinLink(event.locals.ctx!);
		} catch (problem) {
			const refused = refusal(problem);
			return fail(refused.status, { error: refused.message });
		}
		return { link: 'on' as const };
	},

	linkReplace: async (event) => {
		try {
			replaceJoinLink(event.locals.ctx!);
		} catch (problem) {
			const refused = refusal(problem);
			return fail(refused.status, { error: refused.message });
		}
		return { link: 'replaced' as const };
	},

	linkOff: async (event) => {
		turnOffJoinLink(event.locals.ctx!);
		return { link: 'off' as const };
	},

	admit: async (event) => {
		const form = await event.request.formData();
		try {
			const admitted = admitJoinRequest(event.locals.ctx!, String(form.get('id') ?? ''));
			return admitted.kind === 'admitted'
				? { admitted: admitted.name }
				: { alreadyMember: admitted.name };
		} catch (problem) {
			const refused = refusal(problem);
			return fail(refused.status, { requestGone: refused.status === 404, error: refused.message });
		}
	},

	/**
	 * Declined: the request goes, and the person is told by mail — they are not a
	 * member, so no notification can reach them. The address comes back from the
	 * service because the account may be erased by the time this sends.
	 */
	decline: async (event) => {
		const ctx = event.locals.ctx!;
		const form = await event.request.formData();
		let declined;
		try {
			declined = declineJoinRequest(ctx, String(form.get('id') ?? ''));
		} catch (problem) {
			const refused = refusal(problem);
			return fail(refused.status, { requestGone: refused.status === 404, error: refused.message });
		}
		try {
			await getMailTransport().send({
				...joinDeclinedMessage(declined.email, ctx.community.name, ctx.community.locale as Locale),
				communityId: ctx.community.id
			});
		} catch (problem) {
			getLogger().error(
				{
					communityId: ctx.community.id,
					err: problem instanceof Error ? problem.message : String(problem)
				},
				'decline not sent'
			);
		}
		return { declined: true };
	}
};
