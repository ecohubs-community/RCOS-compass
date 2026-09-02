import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * docs/06-testing-strategy.md §6.2: every server file under the authenticated
 * and admin route groups makes an explicit permission check.
 *
 * A static sweep rather than a runtime probe, because the failure it prevents is
 * a route shipped without a check at all — which a runtime probe would only find
 * if someone remembered to write a case for that route.
 */
const routes = join(import.meta.dirname, '../../src/routes');

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

/** Server files that decide what a request may see. */
function guardedFiles(group: string): string[] {
	const root = join(routes, group);
	try {
		statSync(root);
	} catch {
		return [];
	}
	return walk(root).filter((f) => /\+(page|layout)\.server\.ts$|\+server\.ts$/.test(f));
}

/**
 * A file is guarded if it checks a capability itself, or if it inherits from a
 * layout that does — a page under an already-guarded layout does not need to
 * repeat the check to read what that layout resolved.
 */
function isGuarded(file: string): boolean {
	const source = readFileSync(file, 'utf8');
	if (/requirePermission\(/.test(source)) return true;
	// A parent layout in the same tree guards it.
	const parts = file.split('/');
	for (let i = parts.length - 1; i > 0; i -= 1) {
		const layout = [...parts.slice(0, i), '+layout.server.ts'].join('/');
		if (layout === file) continue;
		try {
			if (/requirePermission\(/.test(readFileSync(layout, 'utf8'))) return true;
		} catch {
			// no layout at this level
		}
	}
	return false;
}

describe('every authenticated route authorises', () => {
	const files = guardedFiles('(app)');

	it('finds server routes to check', () => {
		// If this ever reaches zero the suite below is vacuous.
		expect(files.length).toBeGreaterThan(0);
	});

	it.each(files.map((f) => relative(routes, f)))('%s', (relativePath) => {
		const file = join(routes, relativePath);
		expect(
			isGuarded(file),
			`${relativePath} makes no permission check and no parent layout does either`
		).toBe(true);
	});
});

describe('the sweep would notice an unguarded route', () => {
	it('rejects a server file with no check and no guarded parent', () => {
		// Proving the predicate rather than trusting it: a file whose text has no
		// requirePermission and which sits outside any guarded tree is not guarded.
		const unguarded = join(routes, 'healthz/+server.ts');
		expect(isGuarded(unguarded)).toBe(false);
	});
});
