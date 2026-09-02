#!/usr/bin/env node
/**
 * Prints readiness and compliance for a synthetic community.
 *
 * The arithmetic in docs/03-data-model.md §7 is the product's central claim, and
 * it is easier to be wrong about it than about anything else in the codebase.
 * This exercises it against the real standard before a single screen exists, and
 * makes the shape of the answer inspectable by a person rather than only by a
 * test.
 *
 *   node scripts/readiness-demo.mjs            # a community part-way through
 *   node scripts/readiness-demo.mjs --empty    # day one
 *   node scripts/readiness-demo.mjs --complete # everything adopted
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const ROOT = new URL('..', import.meta.url).pathname;
const DIR = join(ROOT, 'standard/rcos-core/0.1');
const read = (name) => yaml.load(readFileSync(join(DIR, `${name}.yaml`), 'utf8'));

const clauses = read('clauses');
const sections = read('sections');
const artifacts = read('artifacts');
const meta = read('meta');

const mode = process.argv.includes('--empty')
	? 'empty'
	: process.argv.includes('--complete')
		? 'complete'
		: 'partial';

/** Which sections our synthetic community has adopted a definition for. */
const adopted = new Set();
if (mode === 'complete') {
	for (const section of sections) adopted.add(section.key);
} else if (mode === 'partial') {
	// Layer 0 finished, Layer 1 half done — the shape of a real community a few
	// months in.
	for (const artifact of artifacts) {
		if (artifact.layer === 0) artifact.sectionKeys.forEach((k) => adopted.add(k));
		if (artifact.layer === 1) artifact.sectionKeys.slice(0, 2).forEach((k) => adopted.add(k));
	}
}

const countable = clauses.filter(
	(c) => c.normativity === 'MUST' && c.disposition === 'defined_by_section'
);
const satisfied = countable.filter((c) => c.owner && adopted.has(c.owner));

const pct = (n, d) => (d === 0 ? 100 : Math.round((n / d) * 100));

console.log('\nRCOS-Core %s — synthetic community (%s)\n', meta.version, mode);

console.log('Readiness by layer');
for (const layer of meta.layers) {
	const inLayer = countable.filter((c) => c.layer === layer.n);
	const done = inLayer.filter((c) => satisfied.includes(c));
	const percent = pct(done.length, inLayer.length);
	const bar = '█'.repeat(Math.round(percent / 5)).padEnd(20, '·');
	console.log(
		'  %s  %s %s%%  %d/%d',
		String(layer.n) + ' · ' + layer.name.padEnd(18),
		bar,
		String(percent).padStart(3),
		done.length,
		inLayer.length
	);
}
console.log(
	'\n  Overall readiness: %d%%  (%d of %d answerable MUST clauses)',
	pct(satisfied.length, countable.length),
	satisfied.length,
	countable.length
);

// Compliance is binary and counts artifacts, not clauses.
const mandatory = artifacts.filter((a) => a.mandatory);
const incomplete = mandatory.filter((a) => !a.sectionKeys.every((k) => adopted.has(k)));
const compliant = incomplete.length === 0;

console.log('\nCompliance (the outward claim)');
console.log(
	'  %s',
	compliant
		? 'RCOS-Core compliant.'
		: `Not yet RCOS-Core compliant — ${incomplete.length} of ${mandatory.length} mandatory artifacts incomplete.`
);
for (const artifact of incomplete.slice(0, 5)) {
	const missing = artifact.sectionKeys.filter((k) => !adopted.has(k)).length;
	console.log(
		'    · %s — %d of %d sections unanswered',
		artifact.key,
		missing,
		artifact.sectionKeys.length
	);
}
if (incomplete.length > 5) console.log('    · … and %d more', incomplete.length - 5);

console.log('\nNot counted, and why');
const byDisposition = {};
for (const clause of clauses) {
	if (clause.disposition === 'defined_by_section') continue;
	(byDisposition[clause.disposition] ??= []).push(clause.ref);
}
for (const [disposition, refs] of Object.entries(byDisposition)) {
	console.log('  %s: %d — %s', disposition, refs.length, refs.join(', '));
}
console.log(
	'  SHOULD: %d · MAY: %d  (shown separately; never in the percentage)\n',
	clauses.filter((c) => c.normativity === 'SHOULD').length,
	clauses.filter((c) => c.normativity === 'MAY').length
);
