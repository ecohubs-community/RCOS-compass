import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { glossaryTerm } from '$lib/server/services/glossary';
import type { RequestHandler } from './$types';

/**
 * One term, for the panel that opens over whatever somebody was reading.
 *
 * Behind the community layout like every other route here, so it is scoped to
 * the caller's own community by the same check as the page — a term's community
 * half is that community's adopted text, and this is the one place it would be
 * easy to serve without asking whose it is.
 */
export const GET: RequestHandler = ({ locals, params }) => {
	const entry = glossaryTerm(locals.ctx!, params.key, { db: getDb() });
	if (!entry) error(404, 'Not found');
	return json(entry);
};
