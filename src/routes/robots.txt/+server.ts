import { getConfig } from '$lib/server/config';
import type { RequestHandler } from './$types';

/**
 * Crawlable where it is meant to be, and nowhere else.
 *
 * UI spec §4.8 calls communities publishing their governance "free
 * distribution" for RCOS — a public index nobody can find is not distribution.
 * So `/p/` is allowed and every authenticated surface is refused, which is a
 * courtesy to crawlers rather than a security measure: the authenticated routes
 * refuse anonymous requests regardless, and a `Disallow` that was the only thing
 * protecting them would be a rule enforced by other people's politeness.
 */
export const GET: RequestHandler = () => {
	const body = [
		'User-agent: *',
		'Allow: /p/',
		'Disallow: /c/',
		'Disallow: /admin/',
		'Disallow: /sign-in',
		'Disallow: /api/',
		'',
		`Sitemap: ${getConfig().PUBLIC_APP_URL}/sitemap.xml`,
		''
	].join('\n');

	return new Response(body, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=3600'
		}
	});
};
