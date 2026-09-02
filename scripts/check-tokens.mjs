#!/usr/bin/env node
/**
 * Fails when a hex colour appears anywhere in src/ except the token file.
 *
 * docs/02-component-guidelines.md §5: colours are defined once, in src/app.css,
 * and referenced by semantic name. ESLint cannot see inside Svelte template
 * attributes, so this check exists rather than a rule that only looks enforced.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const scanRoot = join(root, 'src');
const allowed = new Set([join(root, 'src/app.css')]);
const hex = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/;

/**
 * Tailwind 3 wrote a CSS variable as `rounded-[--radius-card]`. Tailwind 4 does
 * not resolve that form: it emits the literal `border-radius:--radius-card`,
 * which browsers discard, so the style silently disappears. Use
 * `rounded-(--radius-card)` instead. Caught here because nothing else catches
 * it — the build succeeds and the page just looks wrong.
 */
const bareVariable = /[a-z-]+-\[--[a-z][a-z0-9-]*\]/;

/** @param {string} dir @returns {string[]} */
function walk(dir) {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		if (entry.startsWith('.')) return [];
		return statSync(path).isDirectory() ? walk(path) : [path];
	});
}

const problems = [];
for (const file of walk(scanRoot)) {
	if (allowed.has(file)) continue;
	if (!/\.(svelte|ts|js|css|html)$/.test(file)) continue;
	readFileSync(file, 'utf8')
		.split('\n')
		.forEach((line, index) => {
			const where = `${relative(root, file)}:${index + 1}`;
			if (hex.test(line)) {
				problems.push(`${where}  hex colour: ${line.trim()}`);
			}
			const bare = bareVariable.exec(line);
			if (bare) {
				problems.push(
					`${where}  Tailwind 4 does not resolve "${bare[0]}" — ` +
						`write it as ${bare[0].replace('[--', '(--').replace(']', ')')}`
				);
			}
		});
}

if (problems.length > 0) {
	console.error(
		'Design-token problems (docs/02-component-guidelines.md §5):\n' +
			'  hex colours belong in src/app.css; CSS variables use (--name), not [--name].\n'
	);
	for (const problem of problems) console.error('  ' + problem);
	process.exit(1);
}
