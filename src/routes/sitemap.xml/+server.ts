import { and, eq } from 'drizzle-orm';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { community } from '$lib/server/db/schema/tenancy';
import type { RequestHandler } from './$types';

/**
 * The index of published communities, which is what `robots.txt` points at —
 * led by `/sitemap-pages.xml`, the instance's own front page and legal pages.
 *
 * A sitemap index rather than a page list: each community has its own sitemap
 * under `/p/<slug>/sitemap.xml`, and this names them. Without it the `Sitemap:`
 * line in robots.txt was a 404 and no community was ever discovered through one
 * — which is the distribution UI spec §4.8 says publishing is for.
 *
 * Only communities that switched their public pages on appear. A community with
 * the switch off is not listed anywhere, exactly as its pages are not served.
 */
export const GET: RequestHandler = () => {
	const base = getConfig().PUBLIC_APP_URL;
	const published = getDb()
		.select({ slug: community.slug })
		.from(community)
		.where(and(eq(community.publicIndexEnabled, true), eq(community.status, 'active')))
		.all();

	const entries = [
		`${base}/sitemap-pages.xml`,
		...published.map((row) => `${base}/p/${row.slug}/sitemap.xml`)
	]
		.map((loc) => `  <sitemap><loc>${escapeXml(loc)}</loc></sitemap>`)
		.join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</sitemapindex>\n`,
		{
			headers: {
				'content-type': 'application/xml; charset=utf-8',
				'cache-control': 'public, max-age=3600'
			}
		}
	);
};

const escapeXml = (value: string) =>
	value.replace(
		/[<>&'"]/g,
		(c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[c]};`
	);
