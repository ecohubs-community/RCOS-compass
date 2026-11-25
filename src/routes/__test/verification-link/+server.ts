import { error, json } from '@sveltejs/kit';
import { createEmailVerificationToken } from 'better-auth/api';
import { getConfig } from '#lib/server/config.ts';
import type { RequestHandler } from './$types';

/**
 * The link a verification mail would carry, for an e2e spec to follow.
 * `openspec/changes/pilot-blockers` D11.
 *
 * E2E has no mail transport, and the seed marks accounts verified directly. The
 * join link's whole point is what runs *when* an address is verified, so the
 * spec has to follow a real link through the library's own `verify-email`
 * endpoint. The token is minted by the library's exported function with the
 * instance's secret — exactly what the mail would have held — and nothing here
 * marks anything verified itself.
 *
 * Gated on `ALLOW_TEST_ROUTES`, like the seed. It never exists in production.
 */
export const POST: RequestHandler = async ({ request }) => {
	const config = getConfig();
	if (!config.allowTestRoutes) error(404, 'Not found');
	const body = (await request.json().catch(() => ({}))) as {
		email?: string;
		callbackURL?: string;
	};
	if (!body.email) error(400, 'email is required');
	const token = await createEmailVerificationToken(config.BETTER_AUTH_SECRET, body.email);
	const url = new URL('/api/auth/verify-email', config.PUBLIC_APP_URL);
	url.searchParams.set('token', token);
	url.searchParams.set('callbackURL', body.callbackURL ?? '/');
	return json({ url: url.toString() });
};
