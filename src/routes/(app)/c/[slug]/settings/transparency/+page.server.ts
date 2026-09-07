import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { listExceptions } from '$lib/server/services/visibility';
import type { PageServerLoad } from './$types';

/**
 * What this community is hiding from its own members, and why. UI spec §1.6.
 *
 * Readable by every member, not only by the stewards who can create one. An
 * exception a community cannot see is a permission setting again, and RCOS
 * §5.3.5 asks for restrictions to remain auditable — which starts with the
 * people inside being able to audit them.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const all = listExceptions(ctx, { db: getDb() });
	const now = ctx.now();

	return {
		live: all
			.filter((row) => row.expiredAt === null)
			.map((row) => ({
				id: row.id,
				subjectType: row.subjectType,
				subjectId: row.subjectId,
				audience: row.audience,
				justification: row.justification,
				expiresAt: row.expiresAt.getTime(),
				// Shown rather than computed on the page, so "ends in four days" and
				// "ended yesterday" cannot disagree with the date beside them.
				daysLeft: Math.ceil((row.expiresAt.getTime() - now) / 86_400_000),
				renewsId: row.renewsId
			})),
		ended: all
			.filter((row) => row.expiredAt !== null)
			.map((row) => ({
				id: row.id,
				subjectType: row.subjectType,
				justification: row.justification,
				expiredAt: row.expiredAt!.getTime()
			})),
		can: { manage: ctxCan(ctx, 'exception.create') }
	};
};
