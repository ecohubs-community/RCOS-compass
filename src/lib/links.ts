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
	/** The same page with the clause already in the box. */
	startDiscussion: (slug: string, clauseKey: string) =>
		`${resolve('/(app)/c/[slug]/discussions', { slug })}?clause=${encodeURIComponent(clauseKey)}`,
	discussion: (slug: string, id: string) =>
		resolve('/(app)/c/[slug]/discussions/[id]', { slug, id }),
	definition: (slug: string, id: string) =>
		resolve('/(app)/c/[slug]/definitions/[id]', { slug, id }),
	documents: (slug: string) => resolve('/(app)/c/[slug]/documents', { slug }),
	document: (slug: string, id: string) => resolve('/(app)/c/[slug]/documents/[id]', { slug, id }),
	documentFile: (slug: string, id: string) =>
		resolve('/(app)/c/[slug]/documents/[id]/file', { slug, id }),
	aiSettings: (slug: string) => resolve('/(app)/c/[slug]/settings/ai', { slug }),
	pathSettings: (slug: string) => resolve('/(app)/c/[slug]/settings/path', { slug }),
	transparency: (slug: string) => resolve('/(app)/c/[slug]/settings/transparency', { slug }),
	publishing: (slug: string) => resolve('/(app)/c/[slug]/settings/publishing', { slug }),
	audit: (slug: string) => resolve('/(app)/c/[slug]/audit', { slug }),
	exportSettings: (slug: string) => resolve('/(app)/c/[slug]/settings/export', { slug }),
	mirror: (slug: string) => resolve('/(app)/c/[slug]/settings/mirror', { slug }),
	path: (slug: string) => resolve('/(app)/c/[slug]/path', { slug }),
	interview: (slug: string) => resolve('/(app)/c/[slug]/settings/interview', { slug }),
	decisions: (slug: string) => resolve('/(app)/c/[slug]/decisions', { slug }),
	search: (slug: string) => resolve('/(app)/c/[slug]/search', { slug }),
	glossary: (slug: string) => resolve('/(app)/c/[slug]/glossary', { slug }),
	decision: (slug: string, ref: string) => resolve('/(app)/c/[slug]/d/[ref]', { slug, ref })
};
