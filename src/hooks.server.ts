import type { Handle, HandleServerError } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { assertConfigOrExit } from '$lib/server/config';
import { initDatabase } from '$lib/server/db';
import { getLogger } from '$lib/server/logger';
import { securityHeaders } from '$lib/server/http/security-headers';
import { handlers } from '$lib/server/jobs/handlers';
import { enqueue, startWorker } from '$lib/server/jobs';
import { systemClock } from '$lib/server/clock';

/**
 * Validated before the server accepts a single request. A misconfigured instance
 * must fail loudly at boot rather than quietly at the first freeze.
 * docs/00-architecture.md §10.
 */
const config = assertConfigOrExit();
const log = getLogger();

// Single-instance only — see initDatabase().
const db = initDatabase();

// The in-process worker. docs/00-architecture.md §6: one instance, so starting it
// here is correct; a second instance would need this moved out.
if (!config.isTest) {
	startWorker(db, handlers, { intervalMs: 5_000 });
	enqueue(db, systemClock, { kind: 'prune-rate-limits' });
}

export const handle: Handle = async ({ event, resolve }) => {
	// The request id is safe to show a user: it is how a bug report finds its
	// way to the log lines, and it discloses nothing.
	const requestId = randomUUID();

	event.locals.requestId = requestId;
	event.locals.log = log.child({ requestId, route: event.route.id ?? event.url.pathname });

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
