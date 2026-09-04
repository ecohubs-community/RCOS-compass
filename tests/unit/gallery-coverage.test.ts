import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * docs/02-component-guidelines.md §8: the gallery renders every primitive in
 * every state, and the a11y suite scans it at all four viewports. That only
 * means anything while the gallery is complete — a primitive nobody added to it
 * is a primitive nothing scans, and `InlineText` was exactly that until this
 * test existed.
 *
 * Asserted against the directory rather than a list kept by hand, because a list
 * kept by hand has the same failure mode as the gallery.
 */
const uiDir = join(import.meta.dirname, '../../src/lib/components/ui');
const gallery = join(import.meta.dirname, '../../src/routes/dev/components/+page.svelte');

describe('the component gallery', () => {
	const primitives = readdirSync(uiDir)
		.filter((file) => file.endsWith('.svelte'))
		.map((file) => file.replace('.svelte', ''));

	it('finds the primitives at all — an empty list would make this vacuous', () => {
		expect(primitives.length).toBeGreaterThan(4);
	});

	it('renders every primitive', () => {
		const source = readFileSync(gallery, 'utf8');
		const missing = primitives.filter(
			(name) => !source.includes(`$lib/components/ui/${name}.svelte`)
		);
		expect(missing, 'primitives missing from /dev/components').toEqual([]);
	});
});
