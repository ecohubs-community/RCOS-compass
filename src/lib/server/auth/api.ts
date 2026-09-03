/**
 * Calling better-auth from a form action.
 *
 * Every call is made with `asResponse: true`. That is not incidental: it is the
 * only mode where a rejected credential comes back as a *value* rather than a
 * thrown `APIError`, so the action can render a field error instead of a 500,
 * and it is the mode that carries the `Set-Cookie` headers a session needs
 * (see `cookies.ts`).
 */

export type AuthOutcome<T> =
	| { ok: true; data: T; response: Response }
	| { ok: false; status: number; code: string | null; message: string };

/** The error shape better-auth serialises. Nothing here is shown verbatim. */
type AuthErrorBody = { message?: unknown; code?: unknown };

/**
 * Narrow a better-auth response to an outcome.
 *
 * `message` is deliberately not passed through to the user by callers that
 * handle credentials: the library's wording distinguishes cases that must stay
 * indistinguishable (docs/04-security.md §3). It is carried so the *log* can say
 * what happened.
 */
export async function readAuth<T>(response: Response): Promise<AuthOutcome<T>> {
	const body = await response
		.clone()
		.json()
		.catch(() => null);

	if (response.ok) {
		return { ok: true, data: body as T, response };
	}

	const error = (body ?? {}) as AuthErrorBody;
	return {
		ok: false,
		status: response.status,
		code: typeof error.code === 'string' ? error.code : null,
		message: typeof error.message === 'string' ? error.message : 'Authentication failed.'
	};
}
