#!/usr/bin/env node
/**
 * How much of the interface is still English literals, and whether that is
 * getting worse.
 *
 * P6 built the localisation machinery and translated the shell and the public
 * surface. Extracting every string from the twenty-odd screens P1–P5 already
 * shipped is mechanical work with no design content, and pretending it was done
 * would be worse than leaving it visible.
 *
 * So this counts what is left and **fails when the number grows**. A ratchet
 * rather than a wall: a new screen written with literals is caught immediately,
 * and the existing backlog can be paid down a screen at a time without the
 * check sitting red for a fortnight — which is how a check stops being read.
 *
 *   pnpm check:i18n            # compare against the baseline
 *   pnpm check:i18n --update   # after extracting some, record the new low
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const BASELINE = join(root, 'scripts/i18n-baseline.json');

/**
 * The admin console is deliberately excluded, and that is a decision rather
 * than an omission: it is platform-operator tooling used by us, not by a
 * community, and translating it would be work with no reader. `dev/` and
 * `__test/` are not shipped surfaces either.
 */
const SKIP = ['(admin)', '/dev/', '__test'];

/**
 * @param {string} dir
 * @returns {string[]}
 */
function svelteFiles(dir) {
	/** @type {string[]} */
	const out = [];
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry);
		if (statSync(path).isDirectory()) out.push(...svelteFiles(path));
		else if (entry.endsWith('.svelte')) out.push(path);
	}
	return out;
}

/**
 * A crude but stable heuristic: user-visible text nodes and the three
 * attributes a screen reader reads. It will miss some and over-count others —
 * what matters is that it counts the *same* way every run, so the direction of
 * the number is meaningful even where its absolute value is not.
 */
/**
 * @param {string} source
 * @returns {string[]}
 */
export function literalsIn(source) {
	const withoutComments = source.replace(/<!--[\s\S]*?-->/g, '');
	const text = [...withoutComments.matchAll(/>\s*([A-Z][^<>{}]{3,}?)\s*</g)].map((m) => m[1] ?? '');
	const attrs = [
		...withoutComments.matchAll(/\b(?:aria-label|placeholder|title)="([A-Z][^"{}]{3,})"/g)
	].map((m) => m[1] ?? '');
	return [...text, ...attrs].filter(
		(value) => !/^[A-Z0-9\s.,:—·-]+$/.test(value) || value.length > 8
	);
}

const files = svelteFiles(join(root, 'src'))
	.filter((path) => !SKIP.some((skip) => path.includes(skip)))
	.map((path) => ({
		path: relative(root, path),
		count: literalsIn(readFileSync(path, 'utf8')).length
	}))
	.filter((file) => file.count > 0)
	.sort((a, b) => b.count - a.count);

const total = files.reduce((sum, file) => sum + file.count, 0);

if (process.argv.includes('--update')) {
	writeFileSync(BASELINE, `${JSON.stringify({ total, files }, null, 2)}\n`);
	console.log(`i18n baseline recorded: ${total} untranslated literals in ${files.length} files`);
	process.exit(0);
}

/** @type {{ total: number; files: { path: string; count: number }[] }} */
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));

if (total > baseline.total) {
	const was = new Map(baseline.files.map((file) => [file.path, file.count]));
	const grown = files.filter((file) => file.count > (was.get(file.path) ?? 0));
	console.error(
		`\nUntranslated interface strings went up: ${baseline.total} → ${total}.\n` +
			'New screens use message functions from $lib/paraglide/messages.\n'
	);
	for (const file of grown) {
		console.error(`  ${file.path}  ${was.get(file.path) ?? 0} → ${file.count}`);
	}
	console.error('\nIf this is deliberate, run: pnpm check:i18n --update\n');
	process.exit(1);
}

console.log(
	`i18n  ${total} untranslated literals in ${files.length} files` +
		(total < baseline.total ? ` · down ${baseline.total - total} from the baseline` : '')
);
