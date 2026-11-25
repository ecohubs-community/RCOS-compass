import { enhance as kitEnhance, type SubmitFunction } from '$app/forms';

/**
 * `use:enhance` that keeps a member on the page they submitted from.
 *
 * SvelteKit 3's `update()` navigates to the action's URL whenever it differs
 * from the current one, query string included, to mimic a native submission.
 * Most forms here post to `?/name`, whose URL has no query, so on any page that
 * carries one (`?v=2`, `?tab=…`, a selected passage) every submit would land
 * the member on the bare page and lose their place. The notification bell and
 * "Report a problem" post to another page's action and were never meant to
 * leave the current one either.
 *
 * This wrapper makes `update()` default to `navigate: false`: the result is
 * applied where the form is, as SvelteKit 2 did. A redirect from the action is
 * still followed, and a caller can still pass `navigate: true`. Without
 * JavaScript nothing changes, because the browser submits the form itself.
 *
 * eslint holds every component to this import rather than `$app/forms`.
 */
export function enhance<
	Success extends Record<string, unknown> | undefined = Record<string, unknown>,
	Failure extends Record<string, unknown> | undefined = Record<string, unknown>
>(form: HTMLFormElement, submit?: SubmitFunction<Success, Failure>) {
	return kitEnhance<Success, Failure>(form, async (input) => {
		const after = await submit?.(input);
		return (opts) => {
			const update: typeof opts.update = (options) => opts.update({ navigate: false, ...options });
			return after ? after({ ...opts, update }) : update();
		};
	});
}
