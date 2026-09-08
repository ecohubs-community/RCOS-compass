import { requirePlatformAdmin } from '$lib/server/auth/admin';
import { systemClock } from '$lib/server/clock';
import { getDb } from '$lib/server/db';
import { openFeedbackAsMarkdown } from '$lib/server/services/admin/feedback';
import type { PageServerLoad } from './$types';

/**
 * Every open report on the instance, as Markdown.
 *
 * Rendered rather than downloaded: an operator writing a proposal wants to read
 * it, copy the half that is one problem, and leave the rest. A file would put a
 * step between the pilot and the proposal, which is the step this exists to
 * remove.
 */
export const load: PageServerLoad = ({ locals }) => {
	requirePlatformAdmin(locals.user);
	return { markdown: openFeedbackAsMarkdown(getDb(), systemClock.now()) };
};
