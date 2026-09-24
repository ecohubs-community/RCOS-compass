import { fail, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { ctxCan } from '$lib/server/auth/guard';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { decision } from '$lib/server/db/schema/decisions';
import type { Discussion } from '$lib/server/db/schema/discussions';
import { enqueue } from '$lib/server/jobs/queue';
import { freeze } from '$lib/server/services/decisions';
import {
	addMessage,
	addProposal,
	getDiscussion,
	listPostsWithAuthors,
	currentProposal,
	mentionDirectory,
	setCurrentProposal,
	takeOffline
} from '$lib/server/services/discussions';
import { listObjections, resolveObjection } from '$lib/server/services/objections';
import { isArtifactComplete, DECISION_MATRIX } from '$lib/server/services/completeness';
import { membershipLabel } from '$lib/server/services/person';
import { parseMarkdown } from '$lib/server/markdown';
import { isCurrentShape } from '$lib/shared/linter';
import { getVotingProvider } from '$lib/server/voting';
import { aiAvailability } from '$lib/server/ai/run';
import { draftProposalFromThread, summariseThread } from '$lib/server/ai/tasks/summarise-thread';
import { listResponses, roundFor } from '$lib/server/voting/consent-round';
import type { Actions, PageServerLoad, RequestEvent } from './$types';
import { run } from '$lib/server/http/form-action';
import { localMidnight } from '$lib/time/format';

/**
 * One thread, one version on the table, and the freeze. UI spec §5.1, §4.6.
 *
 * The screen is two panes: the conversation on the left, and a rail on the right
 * showing exactly one proposal version — its text, the responses *to that
 * version*, its linter result, and a freeze that would adopt it. The version is
 * chosen with `?v=`, so it is linkable and the rail works with no JavaScript.
 *
 * That the rail follows a selection rather than always showing the newest is the
 * whole point. A community can vote v3 through, watch v4 draw objections, and
 * record v3 — and every number on screen has to belong to the version it is
 * shown beside, because the freeze quotes them into a register that keeps them
 * forever.
 */
export const load: PageServerLoad = ({ locals, params, url }) => {
	const ctx = locals.ctx!;
	const db = getDb();

	const thread = getDiscussion(ctx, params.id, { db });
	const posts = listPostsWithAuthors(ctx, params.id, { db });
	const proposals = posts.filter((entry) => entry.kind === 'proposal');

	/**
	 * The version on screen.
	 *
	 * An unknown or malformed `?v=` falls back to the version the community is
	 * being asked about rather than erroring: a stale link is a stale link, and an
	 * error page is a worse answer than the version the reader would have got
	 * anyway.
	 *
	 * The *current* version and not the newest. Those were the same thing until
	 * the question became movable; now a thread where a steward has put v3 back
	 * would otherwise open on v4 with the response form sitting on v3 — one
	 * screen disagreeing with itself about what is being decided.
	 */
	const asked = Number(url.searchParams.get('v') ?? '');
	const current =
		proposals.find((entry) => entry.id === thread.currentProposalPostId) ??
		proposals.at(-1) ??
		null;
	const selected = proposals.find((entry) => entry.proposalVersion === asked) ?? current;

	/** What a version's button says: never frozen, in force, or superseded. */
	const decisions = new Map(
		db
			.select()
			.from(decision)
			.where(eq(decision.communityId, ctx.community.id))
			.all()
			.map((row) => [row.id, row])
	);
	const frozenState = (frozenDecisionId: string | null) => {
		if (!frozenDecisionId) return { state: 'open' as const, ref: null };
		const found = decisions.get(frozenDecisionId);
		// Derived from the decision rather than stored on the post, so it cannot
		// drift from the decision it describes when a later freeze supersedes it.
		return {
			state: found?.status === 'superseded' ? ('superseded' as const) : ('in_force' as const),
			ref: found?.ref ?? null
		};
	};

	const round = selected ? roundFor(db, selected.id) : undefined;
	// Read once and used twice — for the list and for this reader's own answer.
	// It joins four tables, and this is the most-opened screen in the app.
	const roundResponses = round ? listResponses(ctx, round.id, { db }) : [];
	const inForce = thread.frozenDecisionId ? decisions.get(thread.frozenDecisionId) : undefined;

	/**
	 * What the previous version was told, so the rail can say it did not carry.
	 * "v2 held 5 consents — not carried, the text changed."
	 */
	const previous = selected
		? proposals[proposals.findIndex((entry) => entry.id === selected.id) - 1]
		: undefined;
	const previousRound = previous ? roundFor(db, previous.id) : undefined;
	const previousTally =
		previousRound && previous
			? {
					version: previous.proposalVersion,
					...getVotingProvider().tally(ctx, previousRound.id, { db })
				}
			: null;

	return {
		/** Two panes that scroll on their own, so the shell stops scrolling as one. */
		fullHeight: true,
		/**
		 * Which composer is open, from the URL rather than from component state.
		 *
		 * Writing a proposal and writing up a meeting are the two acts that produce
		 * everything the register later quotes. A member with no JavaScript could
		 * reach neither while the mode lived in a rune — the reply box was the only
		 * thing that rendered. `docs/01` §the-server-client-contract: the form works
		 * before the bundle arrives, or it does not work.
		 */
		mode:
			(['revise', 'meeting'] as const).find((m) => m === url.searchParams.get('mode')) ?? 'reply',
		thread: {
			id: thread.id,
			title: thread.title,
			status: thread.status,
			origin: thread.origin,
			clauseKey: thread.clauseKey,
			currentProposalPostId: thread.currentProposalPostId,
			decidedRef: inForce?.ref ?? null,
			decidedTitle: inForce?.title ?? null
		},
		/** Names for `@M-0142` in the thread, and who the composer can offer. */
		mentions: mentionDirectory(
			ctx,
			posts.map((entry) => entry.body),
			{ db }
		),
		posts: posts.map((entry) => ({
			id: entry.id,
			kind: entry.kind,
			proposalVersion: entry.proposalVersion,
			revisionNote: entry.revisionNote,
			responseValue: entry.responseValue,
			subjectVersion: entry.subjectVersion,
			objectionState: entry.objectionState,
			author: entry.author,
			body: parseMarkdown(entry.body),
			createdAt: entry.createdAt.getTime(),
			...frozenState(entry.frozenDecisionId)
		})),
		versions: proposals.map((entry) => ({
			id: entry.id,
			version: entry.proposalVersion,
			isCurrent: entry.id === current?.id,
			...frozenState(entry.frozenDecisionId)
		})),
		proposal: selected && {
			id: selected.id,
			version: selected.proposalVersion,
			author: selected.author,
			createdAt: selected.createdAt.getTime(),
			raw: selected.body,
			body: parseMarkdown(selected.body),
			/**
			 * Whether this version is the one being asked about — which is what
			 * every caller of `isLatest` has always meant, back when the two could
			 * not differ. The rail gates the response form on it.
			 */
			isCurrent: selected.id === current?.id,
			isLatest: selected.id === proposals.at(-1)?.id,
			...frozenState(selected.frozenDecisionId),
			/**
			 * Advice on the text that would be adopted, never a gate on adopting it
			 * — and read from what was stored when the version was written, not run
			 * again now. This was the only place in the codebase that linted on a
			 * page load, which meant the panel's verdict could change under a reader
			 * without anybody touching the text.
			 */
			linter: isCurrentShape(selected.linterResult) ? selected.linterResult : null,
			objections: listObjections(ctx, selected.id, { db }).map((objection) => ({
				id: objection.id,
				reason: objection.reason,
				state: objection.state
			}))
		},
		/**
		 * The version before this one, so a reader can see what a revision did to
		 * the words they had already agreed to.
		 */
		comparison:
			previous && selected && url.searchParams.get('compare') === '1'
				? { fromVersion: previous.proposalVersion, from: previous.body, to: selected.body }
				: null,
		previousVersion: previous?.proposalVersion ?? null,
		/**
		 * The later version, when the reader is looking at an older one.
		 *
		 * Genuinely *newest*, not *current*: this warns a reader that something
		 * newer than what they are reading exists, which is true whether or not
		 * the community has moved the question to it.
		 */
		laterVersion:
			selected && selected.id !== proposals.at(-1)?.id ? proposals.at(-1)!.proposalVersion : null,
		/** Which version answers, so the rail can mark it and gate the form on it. */
		currentVersion: current?.proposalVersion ?? null,
		round: round && {
			id: round.id,
			status: round.status,
			openedAt: round.openedAt.getTime(),
			closesAt: round.closesAt?.getTime() ?? null,
			tally: getVotingProvider().tally(ctx, round.id, { db }),
			responses: roundResponses,
			/**
			 * What this reader already said, if anything.
			 *
			 * The three buttons are offered whether or not you have answered, and
			 * answering again replaces your answer rather than adding a second one
			 * (`consent_response` is unique per round and member). Without this the
			 * screen never says which of the three you chose, so consenting and
			 * then objecting reads as casting two votes — and a member who cannot
			 * see their own answer cannot tell whether changing it worked.
			 */
			mine: roundResponses.find((entry) => entry.membershipId === ctx.membership.id) ?? null
		},
		previousTally,
		/**
		 * Whether the two thread suggestions can be offered.
		 *
		 * Not run here. Each costs a member a task from their daily allowance, and
		 * spending that because somebody opened a page would empty an allowance
		 * nobody chose to use.
		 */
		assist: aiAvailability(ctx, { db }) === null,
		can: {
			comment: ctxCan(ctx, 'discussion.comment'),
			propose: ctxCan(ctx, 'proposal.create'),
			freeze: ctxCan(ctx, 'decision.freeze'),
			respond: ctxCan(ctx, 'consent.respond'),
			setCurrent: ctxCan(ctx, 'proposal.set_current')
		},
		// Told before the modal is confirmed, not after (UI spec §5.1).
		wouldBeProvisional: !isArtifactComplete(ctx, DECISION_MATRIX, { db }),
		/** Minted per render, so one person's double submit is one decision. */
		idempotencyKey: randomUUID(),
		freezeOpen: url.searchParams.get('freeze') === '1'
	};
};

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
		const outcome = await run('propose', () =>
			addProposal(
				event.locals.ctx!,
				{
					discussionId: event.params.id,
					body: String(form.get('body') ?? ''),
					revisionNote: String(form.get('revisionNote') ?? '') || null
				},
				{ db: getDb() }
			)
		);
		if ('status' in outcome) return outcome;

		/**
		 * Land on the version that was just written.
		 *
		 * The composer is reached at `?v=3&mode=revise`, and without this the
		 * reader would still be pinned to v3 while v4 is now the text on the
		 * table — looking at an old version, with a banner telling them so, right
		 * after writing the new one.
		 */
		const written = outcome.result as { proposalVersion: number | null };
		redirect(
			303,
			`/c/${event.params.slug}/discussions/${event.params.id}?v=${written.proposalVersion}`
		);
	},

	offline: async (event) => {
		const form = await event.request.formData();
		const outcome = await run('offline', () =>
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
		if ('status' in outcome) return outcome;

		// Same reason as `propose`: a meeting produces a version, and the rail
		// should be showing it.
		const { proposal } = outcome.result as { proposal: { proposalVersion: number | null } };
		redirect(
			303,
			`/c/${event.params.slug}/discussions/${event.params.id}?v=${proposal.proposalVersion}`
		);
	},

	/**
	 * Ask for a summary of the thread, or for the rule it is reaching for.
	 *
	 * Neither writes anything. What comes back is text in a box a member edits and
	 * submits under their own name — `docs/00`: a model drafts, structures,
	 * questions and maps, and never adopts. With no provider the button is not
	 * offered, and this action still refuses rather than guessing.
	 */
	suggest: async (event) => {
		const ctx = event.locals.ctx!;
		const db = getDb();
		const form = await event.request.formData();
		const kind = String(form.get('kind') ?? 'summary');

		const posts = listPostsWithAuthors(ctx, event.params.id, { db }).map((entry) => ({
			kind: entry.kind,
			body: entry.body
		}));
		if (posts.length === 0) {
			return fail(409, { step: 'suggest', error: 'There is nothing here to read yet.' });
		}

		const outcome =
			kind === 'draft'
				? await draftProposalFromThread(ctx, posts, { db })
				: await summariseThread(ctx, posts, { db });

		if (outcome.text === null) {
			return fail(409, {
				step: 'suggest',
				error: outcome.result.ok
					? 'The suggestion did not come back in a usable form. Nothing was changed.'
					: outcome.result.reason
			});
		}

		// Returned, never posted: it lands in a field with a Send button beside it.
		return { step: 'suggest', suggestion: outcome.text, suggestionKind: kind };
	},

	/**
	 * Put an earlier version back on the table.
	 *
	 * A form like every other act here, so it works before the bundle does. The
	 * redirect lands on the version that is now the question, because that is the
	 * screen the steward was asking for.
	 */
	setCurrent: async (event) => {
		const form = await event.request.formData();
		const outcome = await run('setCurrent', () =>
			setCurrentProposal(
				event.locals.ctx!,
				{
					discussionId: event.params.id,
					proposalPostId: String(form.get('proposalPostId') ?? ''),
					reason: String(form.get('reason') ?? '') || null
				},
				{ db: getDb() }
			)
		);
		if ('status' in outcome) return outcome;

		// The version number, and nothing else. Reading the whole thread for it
		// resolved a person label per post and threw all of them away.
		const moved = outcome.result as Discussion;
		const version = currentProposal(moved, { db: getDb() })?.proposalVersion;
		redirect(303, `/c/${event.params.slug}/discussions/${event.params.id}?v=${version ?? ''}`);
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

	/**
	 * One door onto a response.
	 *
	 * Objecting used to be its own action beside the round, which meant an
	 * objection could exist with no response behind it and a tally that did not
	 * know about it. A member now answers a proposal, and an objection is one of
	 * the three things that answer can be.
	 */
	respond: async (event) => {
		const form = await event.request.formData();
		return run('round', () =>
			getVotingProvider().respond(
				event.locals.ctx!,
				{
					proposalPostId: String(form.get('proposalPostId') ?? ''),
					value: String(form.get('value') ?? 'consent') as 'consent',
					reason: String(form.get('reason') ?? '') || undefined
				},
				{ db: getDb() }
			)
		);
	},

	freeze: async (event: RequestEvent) => {
		const form = await event.request.formData();
		// A blank field means "no tally". Anything else has to be a count: NaN
		// binds as NULL, so "twenty-one" was silently recorded as no tally at all,
		// on a decision that keeps its numbers forever.
		const bad: string[] = [];
		const number = (name: string) => {
			const raw = String(form.get(name) ?? '').trim();
			if (raw === '') return null;
			const parsed = Number(raw);
			if (!Number.isInteger(parsed) || parsed < 0) {
				bad.push(name);
				return null;
			}
			return parsed;
		};

		const counts = {
			tallyPresent: number('tallyPresent'),
			tallyFor: number('tallyFor'),
			tallyAgainst: number('tallyAgainst')
		};
		if (bad.length > 0) {
			return fail(400, { step: 'freeze', error: 'A tally is a whole number of people.' });
		}

		// A review date is a day on the community's calendar, so it starts at that
		// day's midnight in the community's zone — not UTC's, which put it on the
		// day before for everybody west of Greenwich. `openspec/changes/local-time`.
		const reviewRaw = String(form.get('reviewDueAt') ?? '').trim();
		const reviewDueAt = reviewRaw
			? localMidnight(reviewRaw, event.locals.ctx!.community.timezone)
			: null;
		if (reviewRaw && reviewDueAt === null) {
			return fail(400, { step: 'freeze', error: 'A review date has to be a date.' });
		}

		/**
		 * Who was present, and who agreed to be named for it.
		 *
		 * Asked at the freeze because nobody can go back and ask the room later
		 * (`docs/03` §10). The checkbox is per attendee: a community-level setting
		 * must never be able to publish somebody who did not consent.
		 */
		const attendees = form.getAll('attendee').map((value) => ({
			membershipId: String(value),
			consentedToPublish: form.getAll('attendeePublish').includes(String(value))
		}));

		const outcome = await run('freeze', () =>
			freeze(
				event.locals.ctx!,
				{
					discussionId: event.params.id,
					// The version the form was opened on, never "whatever is newest
					// now" — a steward who read v3 must not record v4's words.
					proposalPostId: String(form.get('proposalPostId') ?? '') || undefined,
					idempotencyKey: String(form.get('idempotencyKey') ?? ''),
					title: String(form.get('title') ?? ''),
					type: String(form.get('type') ?? 'operational') as 'operational',
					mechanism: String(form.get('mechanism') ?? ''),
					threshold: String(form.get('threshold') ?? '') || null,
					...counts,
					reviewDueAt,
					attendees,
					rationale: String(form.get('rationale') ?? '') || null
				},
				{ db: getDb() }
			)
		);

		if ('status' in outcome) return outcome;

		/**
		 * The mirror, after the freeze transaction has committed and never inside
		 * it (`docs/00` §9). A repository that is briefly behind is fine; a
		 * decision that failed to record because a git remote was unreachable is
		 * not.
		 */
		const recorded = outcome.result as { ref: string; title: string };
		enqueue(getDb(), systemClock, {
			kind: 'mirror-commit',
			payload: {
				communityId: event.locals.ctx!.community.id,
				actorLabel: membershipLabel(event.locals.ctx!.membership.seq),
				subject: `${recorded.ref} — ${recorded.title}`
			}
		});

		redirect(303, `/c/${event.params.slug}/d/${recorded.ref}`);
	}
};
