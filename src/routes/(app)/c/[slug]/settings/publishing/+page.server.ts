import { fail } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { ctxCan } from '$lib/server/auth/guard';
import { changeLog } from '$lib/server/db/schema/decisions';
import { getDb } from '$lib/server/db';
import { outwardClaim } from '$lib/server/services/claim';
import { answeredSections, standardViewFor } from '$lib/server/services/completeness';
import { definitionsBySection } from '$lib/server/services/definitions';
import {
	publishAll,
	publishedSubjects,
	setPublicIndex,
	withdrawAll
} from '$lib/server/services/publishing';
import type { Actions, PageServerLoad } from './$types';

/**
 * A community's public face. UI spec §1.6, §4.8.
 *
 * Two gates on one screen, because they are two different decisions and a
 * member should be able to see both: whether this community has public pages at
 * all, and which artifacts are on them.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const db = getDb();

	/**
	 * What could be published, not only what has been.
	 *
	 * The first version of this screen listed what was already public and offered
	 * "withdraw" — which meant nothing could ever get there, because publishing
	 * had a service and no button. The exit spec found it, which is what an exit
	 * spec is for.
	 */
	const standard = standardViewFor(db, ctx.community.id);
	const answered = standard ? answeredSections(db, standard.row.id) : new Set<string>();
	const bySection = definitionsBySection(ctx, { db });

	const publishable = standard
		? standard.view.artifacts
				.map((artifact) => {
					const sections = standard.view
						.authoredSectionsOf(artifact.key)
						.filter((section) => answered.has(section.key))
						.map((section) => bySection.get(section.key))
						.filter((row) => row !== undefined);
					return {
						key: artifact.key,
						title:
							standard.view.localise(artifact.i18n, ctx.community.locale as 'en').value.title ??
							artifact.key,
						definitions: sections.map((row) => ({ id: row.id, visibility: row.visibility }))
					};
				})
				.filter((artifact) => artifact.definitions.length > 0)
		: [];

	/**
	 * What has been published and withdrawn, and when.
	 *
	 * The spec asks for publishing to be *shown*, not merely recorded — and the
	 * first version of this phase wrote change-log entries no screen displayed,
	 * which the exit spec caught. This is where somebody looks for the answer to
	 * "when did this go public, and who agreed?".
	 */
	const activity = db
		.select()
		.from(changeLog)
		.where(
			and(
				eq(changeLog.communityId, ctx.community.id),
				inArray(changeLog.kind, [
					'visibility.published',
					'visibility.withdrawn',
					'community.public_index_on',
					'community.public_index_off'
				])
			)
		)
		.orderBy(desc(changeLog.at))
		.limit(20)
		.all()
		.map((row) => ({
			id: row.id,
			kind: row.kind,
			at: row.at.getTime(),
			summary: row.summary
		}));

	return {
		activity,
		publishable,
		enabled: ctx.community.publicIndexEnabled,
		namesPolicy: ctx.community.publishNamesPolicy,
		published: publishedSubjects(ctx, { db }),
		// Shown here so a steward sees exactly what the world would read before
		// they decide to let the world read it.
		claim: outwardClaim(ctx, { db }),
		can: { manage: ctxCan(ctx, 'artifact.publish') }
	};
};

export const actions: Actions = {
	toggle: async (event) => {
		const form = await event.request.formData();
		setPublicIndex(event.locals.ctx!, form.get('enabled') === 'on', { db: getDb() });
		return { saved: true };
	},

	publish: async (event) => {
		const form = await event.request.formData();
		const db = getDb();
		const withdrawing = form.get('withdraw') === '1';
		// An artifact is a shape in the standard rather than a row, so publishing
		// one means publishing the definitions that answer it — all of them, in one
		// transaction. A loop of single publishes left the first two definitions
		// world-visible when the third was refused, so the screen said "that did not
		// happen" over a public page where half of it had.
		const type = String(form.get('type')) as 'definition' | 'decision' | 'document' | 'artifact';
		const subjects = form.getAll('id').map((id) => ({ type, id: String(id) }));

		try {
			if (withdrawing) withdrawAll(event.locals.ctx!, subjects, { db });
			else publishAll(event.locals.ctx!, subjects, { db });
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 409) return fail(409, { error: http.body?.message ?? '' });
			throw problem;
		}
		return { saved: true };
	}
};
