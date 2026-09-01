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
			if (hex.test(line)) {
				problems.push(`${relative(root, file)}:${index + 1}  ${line.trim()}`);
			}
		});
}

if (problems.length > 0) {
	console.error(
		'Hex colours outside src/app.css. Use a semantic token —\n' +
			'docs/02-component-guidelines.md §5.\n'
	);
	for (const problem of problems) console.error('  ' + problem);
	process.exit(1);
}
