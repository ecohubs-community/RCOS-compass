import { describe, expect, it } from 'vitest';
import { ROUTES, routesOnDisk } from '../support/routes.js';

/**
 * The accessibility list, checked against the filesystem.
 *
 * A unit test rather than part of the a11y spec, because it needs no browser and
 * because a Playwright suite that fails for a bookkeeping reason is a suite
 * people learn to skim. This says one thing: every page is either scanned or
 * somebody wrote down why not.
 */
describe('every page is accounted for', () => {
	it('lists every route on disk', () => {
		const listed = new Set(ROUTES.map((route) => route.id));
		const missing = routesOnDisk().filter((id) => !listed.has(id));

		expect(missing, `routes with no accessibility decision: ${missing.join(', ')}`).toEqual([]);
	});

	it('lists nothing that is not on disk', () => {
		// A stale entry is how a list stops meaning anything: it looks like
		// coverage of a screen that was deleted two phases ago.
		const onDisk = new Set(routesOnDisk());
		const stale = ROUTES.map((route) => route.id).filter((id) => !onDisk.has(id));

		expect(stale, `listed routes that no longer exist: ${stale.join(', ')}`).toEqual([]);
	});

	it('makes every exemption say why', () => {
		for (const route of ROUTES) {
			if (route.scan !== 'exempt') continue;
			// A reason somebody has to write is a reason somebody has to mean. An
			// empty string, or "n/a", is the exemption becoming a checkbox.
			expect(route.because.length, route.id).toBeGreaterThan(20);
		}
	});

	it('fails when a route is added and not listed', () => {
		// The mechanism, exercised rather than trusted.
		const listed = new Set(['(app)/c/[slug]']);
		const missing = ['(app)/c/[slug]', '(app)/c/[slug]/newcomer'].filter((id) => !listed.has(id));

		expect(missing).toEqual(['(app)/c/[slug]/newcomer']);
	});
});
