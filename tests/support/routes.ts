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
	{ id: string; scan: 'a11y' } | { id: string; scan: 'exempt'; because: string };

export const ROUTES: RouteCoverage[] = [
	{ id: '', scan: 'a11y' },
	{ id: '(account)/sign-in', scan: 'a11y' },
	{ id: '(account)/sign-in/two-factor', scan: 'a11y' },
	{ id: '(account)/account/two-factor', scan: 'a11y' },
	{ id: '(app)/c/[slug]', scan: 'a11y' },
	{ id: '(app)/c/[slug]/audit', scan: 'a11y' },
	{ id: '(app)/c/[slug]/d/[ref]', scan: 'a11y' },
	{ id: '(app)/c/[slug]/decisions', scan: 'a11y' },
	{ id: '(app)/c/[slug]/definitions/[id]', scan: 'a11y' },
	{ id: '(app)/c/[slug]/discussions', scan: 'a11y' },
	{ id: '(app)/c/[slug]/discussions/[id]', scan: 'a11y' },
	{ id: '(app)/c/[slug]/documents', scan: 'a11y' },
	{ id: '(app)/c/[slug]/documents/[id]', scan: 'a11y' },
	{ id: '(app)/c/[slug]/glossary', scan: 'a11y' },
	{ id: '(app)/c/[slug]/path', scan: 'a11y' },
	{ id: '(app)/c/[slug]/search', scan: 'a11y' },
	{ id: '(app)/c/[slug]/settings/ai', scan: 'a11y' },
	{ id: '(app)/c/[slug]/settings/export', scan: 'a11y' },
	{ id: '(app)/c/[slug]/settings/interview', scan: 'a11y' },
	{ id: '(app)/c/[slug]/settings/language', scan: 'a11y' },
	{ id: '(app)/c/[slug]/settings/mirror', scan: 'a11y' },
	{ id: '(app)/c/[slug]/settings/path', scan: 'a11y' },
	{ id: '(app)/c/[slug]/settings/publishing', scan: 'a11y' },
	{ id: '(app)/c/[slug]/settings/transparency', scan: 'a11y' },
	{ id: '(app)/c/[slug]/standard', scan: 'a11y' },
	{ id: '(public)/p/[slug]', scan: 'a11y' },
	{ id: '(public)/p/[slug]/a/[artifact]', scan: 'a11y' },

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
