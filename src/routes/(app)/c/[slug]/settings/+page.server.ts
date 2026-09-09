import { redirect } from '@sveltejs/kit';
import { links } from '$lib/links';
import type { PageServerLoad } from './$types';

/**
 * Settings has no page of its own — the layout's list is the page.
 *
 * The interview rather than the first panel alphabetically: it is the one that
 * changes what everything else suggests, and on a community's first week it is
 * the only setting worth opening unprompted.
 *
 * 307, not 308: which panel greets somebody may well change, and a browser
 * caches a 308 forever.
 */
export const load: PageServerLoad = ({ params }) => {
	redirect(307, links.interview(params.slug));
};
