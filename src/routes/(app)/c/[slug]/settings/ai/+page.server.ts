import { fail } from '@sveltejs/kit';
import { ctxCan } from '$lib/server/auth/guard';
import { getDb } from '$lib/server/db';
import { aiSettings, setAiEnabled, usageByMember } from '$lib/server/services/ai-settings';
import type { Actions, PageServerLoad } from './$types';

/**
 * Whether this community sends its governance text to a model, and what that
 * has cost. docs/00-architecture.md §4 rule 4, docs/04-security.md §5.3.
 *
 * The screen states the provider by name. Some hosted tiers reserve the right
 * to train on what they are sent, and a community should decide that knowingly
 * rather than discover it — which is the whole reason this is a screen and not
 * a default.
 */
export const load: PageServerLoad = ({ locals }) => {
	const ctx = locals.ctx!;
	const manage = ctxCan(ctx, 'settings.manage');

	return {
		ai: aiSettings(ctx, { db: getDb() }),
		// A member sees their own spending; a steward sees everyone's.
		perMember: manage ? usageByMember(ctx, { db: getDb() }) : [],
		can: { manage }
	};
};

export const actions: Actions = {
	toggle: async (event) => {
		const form = await event.request.formData();
		try {
			setAiEnabled(event.locals.ctx!, form.get('enabled') === 'on', { db: getDb() });
		} catch (problem) {
			const http = problem as { status?: number; body?: { message?: string } };
			if (http.status === 409) return fail(409, { error: http.body?.message ?? '' });
			throw problem;
		}
		return { saved: true };
	}
};
