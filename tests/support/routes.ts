import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every page the product serves, and whether an accessibility scan reaches it.
 * `docs/02-component-guidelines.md` §6.
 *
 * WCAG AA was committed to in P0 and checked by a spec that visits the screens
 * somebody thought of. That is a pass, not a property: the screens P5 and P6
 * added were scanned because whoever added them remembered, and the twenty-first
 * will be scanned if whoever adds it does. This list makes forgetting fail.
 *
 * `exempt` is deliberately allowed and deliberately requires a sentence. A route
 * that cannot be scanned — a test-only page, a component gallery with its own
 * coverage — is a legitimate answer; a route nobody has thought about is not,
 * and the difference is exactly the sentence.
 */

export type RouteCoverage =
	| {
			id: string;
			scan: 'a11y';
			/**
			 * How the scan reaches it. A path built from a seeded community is walked
			 * by `a11y.spec.ts`; anything needing bespoke setup — a panel opened, a
			 * document uploaded, an id that only exists after a freeze — names the
			 * test that covers it instead, so "who checks this" is answerable from
			 * the list rather than by reading four specs.
			 */
			path?: (slug: string) => string;
			coveredBy?: string;
	  }
	| { id: string; scan: 'exempt'; because: string };

export const ROUTES: RouteCoverage[] = [
	{ id: '', scan: 'a11y', path: () => '/' },
	{ id: '(account)/sign-in', scan: 'a11y', coveredBy: 'the sign-in page has no violations' },
	{
		id: '(account)/sign-in/two-factor',
		scan: 'a11y',
		coveredBy: 'reached only mid-enrolment; the two-factor spec drives it'
	},
	{ id: '(account)/account', scan: 'a11y', path: () => '/account' },
	{
		id: '(account)/invitations/[token]',
		scan: 'a11y',
		coveredBy: 'the invitation page has no violations in any of its states'
	},
	{ id: '(account)/account/two-factor', scan: 'a11y', path: () => '/account/two-factor' },
	{ id: '(app)/c/[slug]', scan: 'a11y', path: (slug) => `/c/${slug}` },
	{ id: '(app)/c/[slug]/audit', scan: 'a11y', path: (slug) => `/c/${slug}/audit` },
	{ id: '(app)/c/[slug]/artifacts', scan: 'a11y', path: (slug) => `/c/${slug}/artifacts` },
	{
		id: '(app)/c/[slug]/d/[ref]',
		scan: 'a11y',
		coveredBy: 'every screen of the loop has no violations'
	},
	{ id: '(app)/c/[slug]/decisions', scan: 'a11y', path: (slug) => `/c/${slug}/decisions` },
	{
		id: '(app)/c/[slug]/definitions/[id]',
		scan: 'a11y',
		coveredBy: 'every screen of the loop has no violations'
	},
	{ id: '(app)/c/[slug]/discussions', scan: 'a11y', path: (slug) => `/c/${slug}/discussions` },
	{
		id: '(app)/c/[slug]/discussions/[id]',
		scan: 'a11y',
		coveredBy: 'the freeze form has no violations, open'
	},
	{ id: '(app)/c/[slug]/documents', scan: 'a11y', path: (slug) => `/c/${slug}/documents` },
	{
		id: '(app)/c/[slug]/documents/[id]',
		scan: 'a11y',
		coveredBy: 'the document screens have no violations'
	},
	{ id: '(app)/c/[slug]/feedback', scan: 'a11y', path: (slug) => `/c/${slug}/feedback` },
	{ id: '(app)/c/[slug]/notifications', scan: 'a11y', path: (slug) => `/c/${slug}/notifications` },
	{
		id: '(app)/c/[slug]/notifications/settings',
		scan: 'a11y',
		path: (slug) => `/c/${slug}/notifications/settings`
	},
	{ id: '(app)/c/[slug]/glossary', scan: 'a11y', path: (slug) => `/c/${slug}/glossary` },
	{ id: '(app)/c/[slug]/members', scan: 'a11y', path: (slug) => `/c/${slug}/members` },
	{ id: '(app)/c/[slug]/path', scan: 'a11y', path: (slug) => `/c/${slug}/path` },
	{ id: '(app)/c/[slug]/search', scan: 'a11y', path: (slug) => `/c/${slug}/search` },
	{
		id: '(app)/c/[slug]/settings/about',
		scan: 'a11y',
		path: (slug) => `/c/${slug}/settings/about`
	},
	{
		id: '(app)/c/[slug]/settings/ai',
		scan: 'a11y',
		path: (slug) => `/c/${slug}/settings/ai`
	},
	{
		id: '(app)/c/[slug]/settings/export',
		scan: 'a11y',
		path: (slug) => `/c/${slug}/settings/export`
	},
	{
		id: '(app)/c/[slug]/settings/interview',
		scan: 'a11y',
		path: (slug) => `/c/${slug}/settings/interview`
	},
	{
		id: '(app)/c/[slug]/settings/language',
		scan: 'a11y',
		path: (slug) => `/c/${slug}/settings/language`
	},
	{
		id: '(app)/c/[slug]/settings/mirror',
		scan: 'a11y',
		path: (slug) => `/c/${slug}/settings/mirror`
	},
	{
		id: '(app)/c/[slug]/settings/path',
		scan: 'a11y',
		path: (slug) => `/c/${slug}/settings/path`
	},
	{
		id: '(app)/c/[slug]/settings/publishing',
		scan: 'a11y',
		path: (slug) => `/c/${slug}/settings/publishing`
	},
	{
		id: '(app)/c/[slug]/settings/transparency',
		scan: 'a11y',
		path: (slug) => `/c/${slug}/settings/transparency`
	},
	{ id: '(app)/c/[slug]/standard', scan: 'a11y', path: (slug) => `/c/${slug}/standard` },
	{ id: '(legal)/privacy', scan: 'a11y', path: () => '/privacy' },
	{ id: '(legal)/terms', scan: 'a11y', path: () => '/terms' },
	{ id: '(legal)/sub-processors', scan: 'a11y', path: () => '/sub-processors' },
	{
		id: '(public)/p/[slug]',
		scan: 'a11y',
		coveredBy: 'the public index and an artifact page have no violations'
	},
	{
		id: '(public)/p/[slug]/a/[artifact]',
		scan: 'a11y',
		coveredBy: 'the public index and an artifact page have no violations'
	},

	{
		id: '(admin)/admin/audit',
		scan: 'exempt',
		because: 'Operator tooling with no community reader; covered by the admin spec instead.'
	},
	{
		id: '(admin)/admin/communities',
		scan: 'exempt',
		because: 'Operator tooling with no community reader.'
	},
	{
		id: '(admin)/admin/communities/[id]',
		scan: 'exempt',
		because: 'Operator tooling with no community reader.'
	},
	{
		id: '(admin)/admin/communities/new',
		scan: 'exempt',
		because: 'Operator tooling with no community reader.'
	},
	{
		id: '(admin)/admin/status',
		scan: 'exempt',
		because: 'Operator tooling with no community reader.'
	},
	{
		id: '(admin)/admin/feedback',
		scan: 'exempt',
		because: 'Operator tooling; the member-facing report screen is scanned in the walk.'
	},
	{
		id: '(admin)/admin/legal',
		scan: 'exempt',
		because: 'Operator tooling; the documents themselves are scanned where a community reads them.'
	},
	{
		id: '__test/boom',
		scan: 'exempt',
		because: 'Throws on purpose. The error page it produces is scanned instead.'
	},
	{
		id: 'dev/components',
		scan: 'exempt',
		because:
			'The gallery is scanned by its own spec at every viewport, which is more than this list would ask for.'
	}
];

/** The page routes on disk, as ids — the thing the list is checked against. */
export function routesOnDisk(root = 'src/routes'): string[] {
	const found: string[] = [];

	const walk = (dir: string, prefix: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				walk(join(dir, entry.name), prefix === '' ? entry.name : `${prefix}/${entry.name}`);
				continue;
			}
			// A page, not an endpoint: `+server.ts` returns bytes and has nothing
			// for a screen reader to read.
			if (entry.name === '+page.svelte') found.push(prefix);
		}
	};

	walk(root, '');
	return found.sort();
}

/** The routes the walk in `a11y.spec.ts` visits, in order. */
export const walkable = (): { id: string; path: (slug: string) => string }[] =>
	ROUTES.flatMap((route) =>
		route.scan === 'a11y' && route.path ? [{ id: route.id, path: route.path }] : []
	);
