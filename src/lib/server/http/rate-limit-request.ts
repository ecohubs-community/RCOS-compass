import { text } from '@sveltejs/kit';
import type { Clock } from '../clock.js';
import type { Db } from '../db/index.js';
import { checkRateLimit } from '../rate-limit.js';
import { recordAudit } from '../services/audit.js';

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

/**
 * Paths where a request can be an attempt at a credential — a password, a
 * six-digit code, a recovery code. Only their POSTs are held to the tighter
 * ceiling; rendering the sign-in page is an ordinary request.
 */
const AUTH_PREFIXES = [
	'/sign-in',
	'/sign-up',
	'/reset-password',
	'/account/two-factor',
	'/api/auth'
];

const AUTH_WINDOW_MS = 15 * 60_000;
const GENERAL_WINDOW_MS = 60_000;

/**
 * Administrative actions. docs/05-admin-console.md §5.6.
 *
 * A ceiling on the widest-reaching account on the instance: sixty writes an hour
 * is far more than an operator does by hand and far less than a stolen session
 * needs to suspend every community on the box.
 */
const ADMIN_ACTIONS_PER_HOUR = 60;
const ADMIN_WINDOW_MS = 60 * 60_000;

export function isExemptFromRateLimit(pathname: string): boolean {
	return EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function isCredentialAttempt(pathname: string, method: string): boolean {
	if (method.toUpperCase() !== 'POST') return false;
	return AUTH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isAdminAction(pathname: string, method: string): boolean {
	if (method.toUpperCase() !== 'POST') return false;
	return pathname === '/admin' || pathname.startsWith('/admin/');
}

export type RateLimitContext = {
	db: Db;
	clock: Clock;
	pathname: string;
	method: string;
	clientAddress: string;
	/** Set once the session is resolved; absent for anonymous requests. */
	userId?: string | null;
	userAgent?: string | null;
	limit: number;
	authLimit: number;
	requestId: string;
};

function refuse(context: RateLimitContext, resetAt: number): Response {
	const retryAfter = Math.max(1, Math.ceil((resetAt - context.clock.now()) / 1000));
	return text('Too many requests. Try again shortly.', {
		status: 429,
		headers: { 'Retry-After': String(retryAfter), 'X-Request-Id': context.requestId }
	});
}

/**
 * Returns a 429 to send, or null to continue.
 *
 * Three buckets, checked in order and stopping at the first refusal:
 *
 *  - **credential attempts**, per IP, at the tight ceiling — this is the one
 *    that makes password and code guessing expensive, and the only one written
 *    to the audit trail;
 *  - **per IP**, the general ceiling — one address cannot occupy the instance;
 *  - **administrative writes**, per admin account, at sixty an hour;
 *  - **per account**, the same ceiling — so one member behind a shared address
 *    (a co-housing project on one connection is the normal case here) cannot
 *    spend everyone else's budget. docs/04-security.md §5.3 asks for exactly
 *    this shape for AI work; it is the same shape here.
 */
export function rateLimitRequest(context: RateLimitContext): Response | null {
	if (isExemptFromRateLimit(context.pathname)) return null;

	if (isCredentialAttempt(context.pathname, context.method)) {
		const attempt = checkRateLimit(context.db, context.clock, {
			key: `auth:ip:${context.clientAddress}`,
			limit: context.authLimit,
			windowMs: AUTH_WINDOW_MS
		});
		if (!attempt.allowed) {
			// Recorded once per refused request: a burst against one address is
			// the thing an operator wants to be able to see afterwards.
			recordAudit(context.db, context.clock, {
				action: 'auth.signin.rate_limited',
				actorId: context.userId ?? null,
				ip: context.clientAddress,
				userAgent: context.userAgent ?? null,
				meta: { path: context.pathname }
			});
			return refuse(context, attempt.resetAt);
		}
	}

	if (context.userId && isAdminAction(context.pathname, context.method)) {
		const byAdmin = checkRateLimit(context.db, context.clock, {
			key: `admin:user:${context.userId}`,
			limit: ADMIN_ACTIONS_PER_HOUR,
			windowMs: ADMIN_WINDOW_MS
		});
		if (!byAdmin.allowed) return refuse(context, byAdmin.resetAt);
	}

	const byAddress = checkRateLimit(context.db, context.clock, {
		key: `request:ip:${context.clientAddress}`,
		limit: context.limit,
		windowMs: GENERAL_WINDOW_MS
	});
	if (!byAddress.allowed) return refuse(context, byAddress.resetAt);

	if (context.userId) {
		const byUser = checkRateLimit(context.db, context.clock, {
			key: `request:user:${context.userId}`,
			limit: context.limit,
			windowMs: GENERAL_WINDOW_MS
		});
		if (!byUser.allowed) return refuse(context, byUser.resetAt);
	}

	return null;
}
