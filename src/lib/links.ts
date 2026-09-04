import { resolve } from '$app/paths';

/**
 * Every link inside a community, in one place.
 *
 * Through `resolve` rather than by string interpolation, so a route that is
 * renamed or removed breaks the build instead of producing a 404 someone finds
 * in a month. Centralised because the same handful of links appears on every
 * screen, and a typo in one of them is a dead end in the middle of the loop.
 */
export const links = {
	dashboard: (slug: string) => resolve('/(app)/c/[slug]', { slug }),
	standard: (slug: string) => resolve('/(app)/c/[slug]/standard', { slug }),
	discussions: (slug: string) => resolve('/(app)/c/[slug]/discussions', { slug }),
	discussion: (slug: string, id: string) =>
		resolve('/(app)/c/[slug]/discussions/[id]', { slug, id }),
	definition: (slug: string, id: string) =>
		resolve('/(app)/c/[slug]/definitions/[id]', { slug, id }),
	decisions: (slug: string) => resolve('/(app)/c/[slug]/decisions', { slug }),
	decision: (slug: string, ref: string) => resolve('/(app)/c/[slug]/d/[ref]', { slug, ref })
};
