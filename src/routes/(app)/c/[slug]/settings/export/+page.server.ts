import { requirePermission } from '$lib/server/auth/guard';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { enqueue } from '$lib/server/jobs/queue';
import { EXPORT_LINK_TTL_MS, listExports, signDownload } from '$lib/server/services/export';
import type { Actions, PageServerLoad } from './$types';

/**
 * "Take everything and leave." `docs/10` §1.3.
 *
 * Stated in the terms as a product promise rather than offered as a feature,
 * which is why it is one button and no options: choosing subsets is a
 * convenience, being able to leave is the promise.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const now = ctx.now();

	return {
		exports: listExports(ctx, { db: getDb() }).map((file) => ({
			id: file.id,
			filename: file.filename,
			bytes: file.bytes,
			createdAt: file.createdAt.getTime(),
			levels: file.levels as string[],
			// Signed at render time, so the clock starts when somebody looks at the
			// page rather than when the bundle was built.
			token: signDownload(file.id, now + EXPORT_LINK_TTL_MS)
		})),
		linkMinutes: Math.round(EXPORT_LINK_TTL_MS / 60_000)
	};
};

export const actions: Actions = {
	export: async (event) => {
		const ctx = event.locals.ctx!;
		requirePermission(ctx, 'community.export');
		enqueue(getDb(), systemClock, {
			kind: 'build-export',
			payload: { communityId: ctx.community.id, actorId: ctx.user.id }
		});
		return { queued: true };
	}
};
