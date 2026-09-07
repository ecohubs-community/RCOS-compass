import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { anonymousIn } from '$lib/server/auth/audience';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { community } from '$lib/server/db/schema/tenancy';
import { publishedArtifacts } from '$lib/server/services/public-index';
import type { RequestHandler } from './$types';

/** One community's published pages, for a crawler that found its index. */
export const GET: RequestHandler = ({ params }) => {
	const db = getDb();
	const found = db
		.select({ id: community.id, enabled: community.publicIndexEnabled })
		.from(community)
		.where(and(eq(community.slug, params.slug), eq(community.status, 'active')))
		.get();
	if (!found?.enabled) error(404, 'Not found');

	const base = `${getConfig().PUBLIC_APP_URL}/p/${params.slug}`;
	const pages = publishedArtifacts(db, anonymousIn(found.id))
		.filter((artifact) => artifact.kind === 'standard')
		.map((artifact) => ({ loc: `${base}/a/${artifact.key}`, at: artifact.updatedAt }));

	const urls = [{ loc: base, at: null as number | null }, ...pages]
		.map(({ loc, at }) =>
			[
				'  <url>',
				`    <loc>${escapeXml(loc)}</loc>`,
				at ? `    <lastmod>${new Date(at).toISOString().slice(0, 10)}</lastmod>` : null,
				'  </url>'
			]
				.filter(Boolean)
				.join('\n')
		)
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

/** A slug is `[a-z0-9-]`, but the base URL is configuration and this is XML. */
const escapeXml = (value: string) =>
	value.replace(
		/[<>&'"]/g,
		(c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[c]};`
	);
