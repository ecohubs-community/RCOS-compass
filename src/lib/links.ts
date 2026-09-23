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
	/**
	 * The same page with the clause already in the box — and, when the link comes
	 * from a Path item, that item's question already in the title.
	 *
	 * The question is the better title than anything a member would type from a
	 * blank field: it is the wording the whole community has been reading in the
	 * Path, so the thread that comes back is recognisably about the thing they
	 * clicked. It is a default rather than a decision — the field is still a
	 * field, and it arrives editable.
	 */
	startDiscussion: (slug: string, clauseKey: string, title?: string) => {
		const url = `${resolve('/(app)/c/[slug]/discussions', { slug })}?clause=${encodeURIComponent(clauseKey)}`;
		return title ? `${url}&title=${encodeURIComponent(title)}` : url;
	},
	discussion: (slug: string, id: string) =>
		resolve('/(app)/c/[slug]/discussions/[id]', { slug, id }),
	definition: (slug: string, id: string) =>
		resolve('/(app)/c/[slug]/definitions/[id]', { slug, id }),
	documents: (slug: string) => resolve('/(app)/c/[slug]/documents', { slug }),
	document: (slug: string, id: string) => resolve('/(app)/c/[slug]/documents/[id]', { slug, id }),
	documentFile: (slug: string, id: string) =>
		resolve('/(app)/c/[slug]/documents/[id]/file', { slug, id }),
	documentVersionFile: (slug: string, id: string, versionId: string) =>
		resolve('/(app)/c/[slug]/documents/[id]/versions/[versionId]/file', { slug, id, versionId }),
	/** Who is here, who holds which role, and who has left. */
	members: (slug: string) => resolve('/(app)/c/[slug]/members', { slug }),
	/** The settings section itself; its layout carries the list of panels. */
	settings: (slug: string) => resolve('/(app)/c/[slug]/settings', { slug }),
	aiSettings: (slug: string) => resolve('/(app)/c/[slug]/settings/ai', { slug }),
	pathSettings: (slug: string) => resolve('/(app)/c/[slug]/settings/path', { slug }),
	transparency: (slug: string) => resolve('/(app)/c/[slug]/settings/transparency', { slug }),
	publishing: (slug: string) => resolve('/(app)/c/[slug]/settings/publishing', { slug }),
	audit: (slug: string) => resolve('/(app)/c/[slug]/audit', { slug }),
	exportSettings: (slug: string) => resolve('/(app)/c/[slug]/settings/export', { slug }),
	/** What the community recorded as something the standard should ask for. */
	standardFeedback: (slug: string) =>
		resolve('/(app)/c/[slug]/settings/standard-feedback', { slug }),
	mirror: (slug: string) => resolve('/(app)/c/[slug]/settings/mirror', { slug }),
	language: (slug: string) => resolve('/(app)/c/[slug]/settings/language', { slug }),
	/** Licences and the documents the community agreed to. */
	about: (slug: string) => resolve('/(app)/c/[slug]/settings/about', { slug }),
	feedback: (slug: string) => resolve('/(app)/c/[slug]/feedback', { slug }),
	/** A member's notifications here: what happened that concerns them. */
	notifications: (slug: string) => resolve('/(app)/c/[slug]/notifications', { slug }),
	/** What this member gets by email from here. */
	notificationSettings: (slug: string) =>
		resolve('/(app)/c/[slug]/notifications/settings', { slug }),
	path: (slug: string) => resolve('/(app)/c/[slug]/path', { slug }),
	interview: (slug: string) => resolve('/(app)/c/[slug]/settings/interview', { slug }),
	decisions: (slug: string) => resolve('/(app)/c/[slug]/decisions', { slug }),
	/** The twenty-one things the standard asks for, and how far each one is. */
	artifacts: (slug: string) => resolve('/(app)/c/[slug]/artifacts', { slug }),
	search: (slug: string) => resolve('/(app)/c/[slug]/search', { slug }),
	glossary: (slug: string) => resolve('/(app)/c/[slug]/glossary', { slug }),
	decision: (slug: string, ref: string) => resolve('/(app)/c/[slug]/d/[ref]', { slug, ref })
};
