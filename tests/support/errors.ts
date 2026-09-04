/**
 * Catching a refusal, without fighting the type narrowing.
 *
 * SvelteKit's `error()` throws an `HttpError` whose `message` is empty — the
 * text lives on `body.message` — so `expect(fn).toThrow(/…/)` silently matches
 * nothing. And the obvious `catch (e) { thrown = e as typeof thrown }` narrows
 * `thrown` to `never` after the initial `null`, which type-checks in the editor
 * and fails in CI.
 *
 * Both mistakes were made twice before this existed.
 */
export type Refusal = { status: number; message: string };

export function catchRefusal(run: () => unknown): Refusal | null {
	try {
		run();
		return null;
	} catch (problem) {
		const http = problem as { status?: number; body?: { message?: string } };
		if (typeof http.status !== 'number') throw problem;
		return { status: http.status, message: http.body?.message ?? '' };
	}
}

/**
 * The same, for a service that returns a promise.
 *
 * Needed because `catchRefusal` returns before an async function has rejected,
 * so a refusal escapes it entirely and the test passes having asserted nothing.
 * Uploading is the first path in the product that is async all the way down.
 */
export async function catchRefusalAsync(run: () => Promise<unknown>): Promise<Refusal | null> {
	try {
		await run();
		return null;
	} catch (problem) {
		const http = problem as { status?: number; body?: { message?: string } };
		if (typeof http.status !== 'number') throw problem;
		return { status: http.status, message: http.body?.message ?? '' };
	}
}
