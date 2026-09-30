import type { RequestHandler } from './$types';
import { getAuth } from '$lib/server/auth/auth';

/**
 * better-auth's own endpoints. docs/01-server-client-contract.md §2 allows this
 * as one of the few legitimate `+server.ts` surfaces.
 *
 * All of them except sign-up. The instance is invitation-only
 * (`docs/10-legal-and-operations.md`): the invitation page is the one place an
 * account is made, and it makes it through the library's server API, which
 * never passes through here. Turning sign-up off in the library would close
 * that door too, so it is closed at the HTTP boundary instead — answered as a
 * route that does not exist, because to a stranger it is one.
 * `tests/integration/closed-sign-up.test.ts`.
 */
const CLOSED = /^\/api\/auth\/sign-up(\/|$)/;

/**
 * Matched on the path as a router might read it — decoded, lower-cased,
 * slashes collapsed — so the door does not reopen the day the library starts
 * routing `/Sign-Up` or `//sign-up` the way it routes `/sign-up` today. A path
 * that will not even decode is refused with it.
 */
function isClosed(pathname: string): boolean {
	try {
		return CLOSED.test(
			decodeURIComponent(pathname)
				.toLowerCase()
				.replace(/\/{2,}/g, '/')
		);
	} catch {
		return true;
	}
}

const handler: RequestHandler = ({ request }) => {
	if (isClosed(new URL(request.url).pathname)) {
		return new Response('Not found', { status: 404 });
	}
	return getAuth().handler(request);
};

export const GET = handler;
export const POST = handler;
