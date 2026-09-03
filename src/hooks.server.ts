import type { Handle, HandleServerError } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { assertConfigOrExit, getConfig } from '$lib/server/config';
import { initDatabase } from '$lib/server/db';
import { getLogger } from '$lib/server/logger';
import { securityHeaders } from '$lib/server/http/security-headers';
import { rateLimitRequest } from '$lib/server/http/rate-limit-request';
import { resolveActor } from '$lib/server/auth/session';
import { requirePlatformAdmin } from '$lib/server/auth/admin';
import { handlers } from '$lib/server/jobs/handlers';
import { enqueue, startWorker } from '$lib/server/jobs';
import { systemClock } from '$lib/server/clock';

/**
 * Validated before the server accepts a single request. A misconfigured instance
 * must fail loudly at boot rather than quietly at the first freeze.
 * docs/00-architecture.md §10.
 *
 * In development it throws instead of exiting. Both say the same thing, but a
 * process that dies takes the dev server with it, so every attempt to fix the
 * `.env` costs a restart — and the message scrolls away behind the restart.
 * Throwing puts it on the error overlay and leaves the server running to pick up
 * the fix. In production, exiting non-zero is the whole point: an instance that
 * boots misconfigured is one that loses records later.
 */
const config = import.meta.env.DEV ? getConfig() : assertConfigOrExit();
const log = getLogger();

// Single-instance only — see initDatabase().
const db = initDatabase();

// The in-process worker. docs/00-architecture.md §6: one instance, so starting it
// here is correct; a second instance would need this moved out.
if (!config.isTest) {
	startWorker(db, handlers, { intervalMs: 5_000 });
	enqueue(db, systemClock, { kind: 'prune-rate-limits' });
}

/**
 * Behind a proxy this needs ADDRESS_HEADER set for adapter-node; without it
 * SvelteKit throws rather than guessing. An unknown address shares one bucket,
 * which is the safe direction: it limits more, not less.
 */
function clientAddress(event: Parameters<Handle>[0]['event']): string {
	try {
		return event.getClientAddress();
	} catch {
		return 'unknown';
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	// The request id is safe to show a user: it is how a bug report finds its
	// way to the log lines, and it discloses nothing.
	const requestId = randomUUID();

	event.locals.requestId = requestId;
	event.locals.log = log.child({ requestId, route: event.route.id ?? event.url.pathname });

	// Identity, before the tenant. The community is resolved per route from the
	// URL (docs/04-security.md §2), never from anything the session carries.
	const actor = await resolveActor(db, event.request, systemClock.now());
	event.locals.user = actor?.user ?? null;
	event.locals.sessionId = actor?.sessionId ?? null;
	if (actor) {
		event.locals.log = event.locals.log.child({ userId: actor.user.id });
	}

	// The first of three admin checks (docs/05-admin-console.md §5). Doing it here
	// means an unguarded admin route never even runs.
	if (event.url.pathname.startsWith('/admin')) {
		requirePlatformAdmin(event.locals.user);
	}

	const refusal = rateLimitRequest({
		db,
		clock: systemClock,
		pathname: event.url.pathname,
		method: event.request.method,
		clientAddress: clientAddress(event),
		userId: event.locals.user?.id ?? null,
		userAgent: event.request.headers.get('user-agent'),
		limit: config.REQUESTS_PER_MINUTE,
		authLimit: config.AUTH_ATTEMPTS_PER_15MIN,
		requestId
	});
	if (refusal) {
		event.locals.log.warn({ path: event.url.pathname }, 'rate limited');
		return refusal;
	}

	const startedAt = performance.now();

	const response = await resolve(event);

	// CSP is set by SvelteKit from svelte.config.js, which nonces its own inline
	// scripts. Everything else is set here.
	for (const [name, value] of Object.entries(
		securityHeaders({ isProduction: config.isProduction })
	)) {
		response.headers.set(name, value);
	}
	response.headers.set('X-Request-Id', requestId);

	event.locals.log.info(
		{ status: response.status, ms: Math.round(performance.now() - startedAt) },
		'request'
	);

	return response;
};

/**
 * docs/01-server-client-contract.md §4: an unexpected error returns a generic
 * message and the request id — never a stack trace, SQL, a file path, or
 * exception text. The detail goes to the log against that same id.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const requestId = event.locals.requestId ?? 'unknown';

	if (status !== 404) {
		(event.locals.log ?? log).error(
			{ requestId, err: error instanceof Error ? error.message : String(error), status },
			'unhandled error'
		);
	}

	return {
		message: status === 404 ? message : 'Something went wrong on our side.',
		requestId
	};
};
