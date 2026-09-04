import { fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { freeze } from '$lib/server/services/decisions';
import {
	addMessage,
	addProposal,
	getDiscussion,
	latestProposal,
	listPosts,
	takeOffline
} from '$lib/server/services/discussions';
import { listObjections, raiseObjection, resolveObjection } from '$lib/server/services/objections';
import { isArtifactComplete, DECISION_MATRIX } from '$lib/server/services/completeness';
import { lint } from '$lib/server/linter';
import { parseMarkdown } from '$lib/server/markdown';
import { getVotingProvider, openRoundFor } from '$lib/server/voting';
import type { Actions, PageServerLoad, RequestEvent } from './$types';

/**
 * One thread, and the Freeze modal. UI spec §5.1, §4.6.
 *
 * The modal is a `<dialog>` the server can also render open — a member without
 * JavaScript reaches the same fields, because recording a decision is not a
 * progressive enhancement.
 */
export const load: PageServerLoad = ({ locals, params, url }) => {
	const ctx = locals.ctx!;
	const db = getDb();

	const thread = getDiscussion(ctx, params.id, { db });
	const posts = listPosts(ctx, params.id, { db });
	const proposal = latestProposal(ctx, params.id, { db });
	const round = proposal ? openRoundFor(db, proposal.id) : undefined;

	return {
		thread: {
			id: thread.id,
			title: thread.title,
			status: thread.status,
			origin: thread.origin,
			clauseKey: thread.clauseKey,
			frozenDecisionId: thread.frozenDecisionId
		},
		posts: posts.map((entry) => ({
			id: entry.id,
			kind: entry.kind,
			proposalVersion: entry.proposalVersion,
			body: parseMarkdown(entry.body),
			createdAt: entry.createdAt.getTime(),
			frozen: entry.frozenDecisionId !== null
		})),
		proposal: proposal && {
			id: proposal.id,
			version: proposal.proposalVersion,
			body: parseMarkdown(proposal.body),
			// Advice on the text that would be adopted, never a gate on adopting it.
			linter: lint({ body: proposal.body, locale: ctx.community.locale }).findings,
			objections: listObjections(ctx, proposal.id, { db }).map((objection) => ({
				id: objection.id,
				reason: objection.reason,
				state: objection.state
			}))
		},
		round: round && {
			id: round.id,
			closesAt: round.closesAt.getTime(),
			tally: getVotingProvider().tally(ctx, round.id, { db })
		},
		can: {
			comment: ctxCan(ctx, 'discussion.comment'),
			propose: ctxCan(ctx, 'proposal.create'),
			freeze: ctxCan(ctx, 'decision.freeze'),
			openRound: ctxCan(ctx, 'consent.open'),
			respond: ctxCan(ctx, 'consent.respond')
		},
		// Told before the modal is confirmed, not after (UI spec §5.1).
		wouldBeProvisional: !isArtifactComplete(ctx, DECISION_MATRIX, { db }),
		/** Minted per render, so one person's double submit is one decision. */
		idempotencyKey: randomUUID(),
		freezeOpen: url.searchParams.get('freeze') === '1'
	};
};

/** Turns a service refusal into a message in the page rather than a 500. */
async function run<T>(step: string, act: () => T) {
	try {
		return { step, result: act() };
	} catch (problem) {
		const http = problem as { status?: number; body?: { message?: string } };
		if (typeof http.status === 'number' && http.status < 500) {
			return fail(http.status, { step, error: http.body?.message ?? 'That did not work.' });
		}
		throw problem;
	}
}

export const actions: Actions = {
	comment: async (event) => {
		const form = await event.request.formData();
		return run('comment', () =>
			addMessage(
				event.locals.ctx!,
				{ discussionId: event.params.id, body: String(form.get('body') ?? '') },
				{ db: getDb() }
			)
		);
	},

	propose: async (event) => {
		const form = await event.request.formData();
		return run('propose', () =>
			addProposal(
				event.locals.ctx!,
				{ discussionId: event.params.id, body: String(form.get('body') ?? '') },
				{ db: getDb() }
			)
		);
	},

	offline: async (event) => {
		const form = await event.request.formData();
		return run('offline', () =>
			takeOffline(
				event.locals.ctx!,
				{
					discussionId: event.params.id,
					summary: String(form.get('summary') ?? ''),
					proposal: String(form.get('proposal') ?? '')
				},
				{ db: getDb() }
			)
		);
	},

	object: async (event) => {
		const form = await event.request.formData();
		return run('object', () =>
			raiseObjection(
				event.locals.ctx!,
				{
					proposalPostId: String(form.get('proposalPostId') ?? ''),
					reason: String(form.get('reason') ?? '')
				},
				{ db: getDb() }
			)
		);
	},

	resolveObjection: async (event) => {
		const form = await event.request.formData();
		return run('object', () =>
			resolveObjection(
				event.locals.ctx!,
				{
					objectionId: String(form.get('objectionId') ?? ''),
					state: String(form.get('state') ?? 'addressed') as 'addressed'
				},
				{ db: getDb() }
			)
		);
	},

	openRound: async (event) => {
		const form = await event.request.formData();
		const days = Number(form.get('days') ?? 7);
		return run('round', () =>
			getVotingProvider().openRound(
				event.locals.ctx!,
				{
					proposalPostId: String(form.get('proposalPostId') ?? ''),
					closesAt: event.locals.ctx!.now() + days * 86_400_000
				},
				{ db: getDb() }
			)
		);
	},

	respond: async (event) => {
		const form = await event.request.formData();
		return run('round', () =>
			getVotingProvider().respond(
				event.locals.ctx!,
				{
					roundId: String(form.get('roundId') ?? ''),
					value: String(form.get('value') ?? 'consent') as 'consent',
					reason: String(form.get('reason') ?? '') || undefined
				},
				{ db: getDb() }
			)
		);
	},

	freeze: async (event: RequestEvent) => {
		const form = await event.request.formData();
		const number = (name: string) => {
			const raw = String(form.get(name) ?? '').trim();
			return raw === '' ? null : Number(raw);
		};

		const outcome = await run('freeze', () =>
			freeze(
				event.locals.ctx!,
				{
					discussionId: event.params.id,
					idempotencyKey: String(form.get('idempotencyKey') ?? ''),
					title: String(form.get('title') ?? ''),
					type: String(form.get('type') ?? 'operational') as 'operational',
					mechanism: String(form.get('mechanism') ?? ''),
					threshold: String(form.get('threshold') ?? '') || null,
					tallyPresent: number('tallyPresent'),
					tallyFor: number('tallyFor'),
					tallyAgainst: number('tallyAgainst'),
					rationale: String(form.get('rationale') ?? '') || null
				},
				{ db: getDb() }
			)
		);

		if ('status' in outcome) return outcome;
		redirect(303, `/c/${event.params.slug}/d/${(outcome.result as { ref: string }).ref}`);
	}
};
