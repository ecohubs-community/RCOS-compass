import { text } from '@sveltejs/kit';
import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { checkRateLimit } from '../rate-limit.js';

/**
 * The per-request rate-limit decision. docs/01-server-client-contract.md §5.
 *
 * Kept out of `hooks.server.ts` so it can be tested without booting the server:
 * the hook module migrates the database and starts the job worker on import,
 * which is the right thing for a server and the wrong thing for a test.
 */

/**
 * Exempt paths.
 *
 * `/healthz` so a container's own probe cannot lock the instance out, and built
 * assets because they are static files rather than work — counting them would
 * let one page load consume a dozen of a member's request budget.
 */
const EXEMPT_PREFIXES = ['/healthz', '/_app/', '/favicon'];

export function isExemptFromRateLimit(pathname: string): boolean {
	return EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export type RateLimitContext = {
	db: Db;
	clock: Clock;
	pathname: string;
	clientAddress: string;
	limit: number;
	requestId: string;
};

/**
 * Returns a 429 to send, or null to continue. The per-user and per-community
 * limits (docs/04-security.md §5.1, §5.3) attach in P2, once identity exists;
 * the key shape is what makes that a small change.
 */
export function rateLimitRequest(context: RateLimitContext): Response | null {
	if (isExemptFromRateLimit(context.pathname)) return null;

	const result = checkRateLimit(context.db, context.clock, {
		key: `request:ip:${context.clientAddress}`,
		limit: context.limit,
		windowMs: 60_000
	});
	if (result.allowed) return null;

	const retryAfter = Math.max(1, Math.ceil((result.resetAt - context.clock.now()) / 1000));
	return text('Too many requests. Try again shortly.', {
		status: 429,
		headers: { 'Retry-After': String(retryAfter), 'X-Request-Id': context.requestId }
	});
}
