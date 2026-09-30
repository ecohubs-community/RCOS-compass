import { getConfig } from '$lib/server/config';
import type { RequestHandler } from './$types';

/**
 * The instance's own public pages — the landing page, and the three legal
 * documents it links — as one small sitemap. Listed first in `/sitemap.xml`,
 * beside the per-community sitemaps, so a crawler that starts from robots.txt
 * finds the front page and not only the communities that publish.
 */
export const GET: RequestHandler = () => {
	const base = getConfig().PUBLIC_APP_URL.replace(/\/+$/, '');
	const urls = [`${base}/`, `${base}/privacy`, `${base}/terms`, `${base}/sub-processors`]
		.map((loc) => `  <url><loc>${loc}</loc></url>`)
		.join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
		{
			headers: {
				'content-type': 'application/xml; charset=utf-8',
				'cache-control': 'public, max-age=3600'
			}
		}
	);
};
