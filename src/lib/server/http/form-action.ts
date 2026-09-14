import { fail } from '@sveltejs/kit';

/**
 * Run one form action, putting a *correctable* refusal in the form and letting
 * every other one be itself.
 *
 * The distinction matters. A 400 or a 409 — "a proposal needs some text", "there
 * is nothing to record yet" — is something the person can fix in front of them,
 * so it belongs beside the field. A 403 or a 404 is not: it means they may not
 * do this, or it is not there, and rendering that as a form hint would dress a
 * refusal up as a typo. Those stay thrown, so the response really carries the
 * status — which is what a test, a log line and a screen reader all read.
 *
 * Awaited inside the try: an act may be async, and a rejection that escaped
 * would be an error page instead of a sentence on the screen. One copy, shared
 * by every route with steps — two drifting copies is how the discussion route's
 * version came to swallow nothing async at all.
 */
const CORRECTABLE = new Set([400, 409, 422]);

export async function run<T>(step: string, act: () => T | Promise<T>) {
	try {
		return { step, result: await act() };
	} catch (problem) {
		const http = problem as { status?: number; body?: { message?: string } };
		if (typeof http.status === 'number' && CORRECTABLE.has(http.status)) {
			return fail(http.status, { step, error: http.body?.message ?? 'That did not work.' });
		}
		throw problem;
	}
}
