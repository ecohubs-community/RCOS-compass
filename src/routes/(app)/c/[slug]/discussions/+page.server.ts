import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listDiscussionSummaries, openDiscussion } from '$lib/server/services/discussions';
import { activeStandardView } from '$lib/server/services/completeness';
import { ctxCan } from '$lib/server/auth/guard';
import type { Actions, PageServerLoad } from './$types';

/**
 * Every thread, newest activity first. UI spec §4.5, design screen 10.
 *
 * The four filters are counted over the whole list and applied to the rows, so
 * a count never describes a different set from the one a click produces. They
 * are a query parameter rather than component state: a steward sends "the two
 * that are waiting on you" to somebody, and the link has to arrive showing
 * them — and the filter has to work before the bundle does.
 */
const FILTERS = ['open', 'waiting', 'in_vote', 'frozen'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * When a thread counts as quiet. `services/path.ts` raises the same flag at the
 * same number, and a screen disagreeing with the Path about which discussions
 * have stalled is two answers to one question.
 */
const QUIET_AFTER_DAYS = 12;

export const load: PageServerLoad = ({ locals, url }) => {
	const ctx = locals.ctx!;
	const db = getDb();

	/**
	 * Layer and document reference for the clause a thread is about.
	 *
	 * Read from the community's own adopted standard, never from the key: the
	 * key is stable across versions and the reference is not, so a thread opened
	 * under 0.1 shows 0.1's number for as long as the community is pinned there.
	 */
	const standard = activeStandardView(db, ctx);
	const layerNames = new Map(
		(standard?.view.meta.layers ?? []).map((layer) => [layer.n, layer.name])
	);

	const now = ctx.now();
	const all = listDiscussionSummaries(ctx, { db }).map((thread) => {
		const clause = thread.clauseKey ? standard?.view.clause(thread.clauseKey) : undefined;
		return {
			id: thread.id,
			title: thread.title,
			status: thread.status,
			origin: thread.origin,
			version: thread.version,
			inVote: thread.inVote,
			waitingOnMe: thread.waitingOnMe,
			lastActivityAt: thread.lastActivityAt,
			people: thread.people,
			last: thread.last,
			/** `L1 · Membership`, the way every other screen says it. */
			layer: clause?.layer ?? null,
			layerName: clause ? (layerNames.get(clause.layer) ?? null) : null,
			clauseRef: clause?.ref ?? null,
			quietDays: Math.floor((now - thread.lastActivityAt) / 86_400_000)
		};
	});

	const matches = (thread: (typeof all)[number], filter: Filter) => {
		if (filter === 'waiting') return thread.waitingOnMe;
		if (filter === 'in_vote') return thread.inVote;
		if (filter === 'frozen') return thread.status === 'frozen';
		// "Open" is everything still trying to become a decision — which is every
		// thread that has not already become one, including the ones in vote.
		return thread.status !== 'frozen' && thread.status !== 'abandoned';
	};

	const asked = url.searchParams.get('filter');
	const filter: Filter = FILTERS.find((value) => value === asked) ?? 'open';

	return {
		filter,
		counts: Object.fromEntries(
			FILTERS.map((value) => [value, all.filter((thread) => matches(thread, value)).length])
		) as Record<Filter, number>,
		discussions: all.filter((thread) => matches(thread, filter)),
		/**
		 * The banner's own two numbers, counted over everything rather than over
		 * the filtered rows: it is the reason to change filter, so it cannot
		 * disappear when you do.
		 */
		attention: {
			waiting: all.filter((thread) => thread.waitingOnMe).length,
			quiet: all.filter((thread) => matches(thread, 'open') && thread.quietDays >= QUIET_AFTER_DAYS)
				.length
		},
		quietAfterDays: QUIET_AFTER_DAYS,
		canStart: ctxCan(ctx, 'discussion.create'),
		// Arrived from the dashboard, the Path or a search result: the question is
		// already chosen, so neither the clause nor the title should have to be
		// typed again. Both are suggestions in editable fields — the thread is the
		// community's, not the Path's.
		clauseKey: url.searchParams.get('clause') ?? '',
		title: url.searchParams.get('title') ?? ''
	};
};

export const actions: Actions = {
	open: async (event) => {
		const form = await event.request.formData();
		const title = String(form.get('title') ?? '').trim();
		const clauseKey = String(form.get('clauseKey') ?? '').trim();
		const origin = form.get('origin') === 'offline' ? ('offline' as const) : ('clause' as const);

		if (!title) return fail(400, { error: 'Give the discussion a title.' });

		let thread;
		try {
			thread = openDiscussion(
				event.locals.ctx!,
				{
					title,
					// The field says optional, so an empty one opens a thread about an
					// open question rather than one about a clause called "unassigned"
					// — which no standard contains, and which no freeze could resolve.
					about: clauseKey ? { kind: 'clause', clauseKey } : { kind: 'open_question' },
					origin
				},
				{ db: getDb() }
			);
		} catch (problem) {
			// A clause that does not exist is a typo in the box in front of them.
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 400 || http.status === 409) {
				return fail(http.status, { error: http.body?.message ?? 'That did not work.' });
			}
			throw problem;
		}

		/**
		 * A thread opened to record a meeting lands in the composer that writes
		 * one up, rather than in the reply box — recording what a room decided is
		 * the reason the thread exists, and a member who chose that button has
		 * already said so.
		 */
		redirect(
			303,
			`/c/${event.params.slug}/discussions/${thread.id}${origin === 'offline' ? '?mode=meeting#composer' : ''}`
		);
	}
};
