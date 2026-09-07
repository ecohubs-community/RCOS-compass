import { fail } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { outwardClaim } from '$lib/server/services/claim';
import {
	publish,
	publishedSubjects,
	setPublicIndex,
	withdraw
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

	return {
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
		const subject = {
			type: String(form.get('type')) as 'definition' | 'decision' | 'document' | 'artifact',
			id: String(form.get('id'))
		};
		try {
			if (form.get('withdraw') === '1') withdraw(event.locals.ctx!, subject, { db: getDb() });
			else publish(event.locals.ctx!, subject, { db: getDb() });
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 409) return fail(409, { error: http.body?.message ?? '' });
			throw problem;
		}
		return { saved: true };
	}
};
