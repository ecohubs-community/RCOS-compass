import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import type { AuditSnapshot } from '$lib/server/services/self-audit';
import { listSelfAudits, runSelfAudit } from '$lib/server/services/self-audit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Self-audit. UI spec §4.8, RCOS §10.1 and Appendix C.5.
 *
 * **Member-visible, and not public.** The snapshot names what the community is
 * restricting and why, which is exactly what an anonymous surface must not
 * carry. The public index cites its *date* and nothing else from it.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const audits = listSelfAudits(ctx, { db: getDb() });

	return {
		audits: audits.map((audit) => ({
			id: audit.id,
			runAt: audit.runAt.getTime(),
			compliant: audit.compliant,
			snapshot: audit.snapshot as AuditSnapshot
		})),
		can: { run: ctxCan(ctx, 'audit.run') }
	};
};

export const actions: Actions = {
	run: async (event) => {
		runSelfAudit(event.locals.ctx!, { db: getDb() });
		return { ran: true };
	}
};
