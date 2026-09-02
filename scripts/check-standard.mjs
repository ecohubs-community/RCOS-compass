#!/usr/bin/env node
/**
 * Validates the vendored standard. This is the first check in CI because it is
 * the cheapest failure and the most likely: every number the product shows is
 * computed from this content.
 *
 * Two things are checked.
 *
 * 1. INTEGRITY — the vendored files still match the hashes published upstream.
 *    The copy is meant to be regenerated in the RCOS-website repository and
 *    copied here, never edited in place: a hand-edit would silently change what
 *    a community's decision records point at.
 *
 * 2. THE OWNERSHIP INVARIANT — every MUST clause is answerable exactly once, or
 *    is explicitly marked as not answerable at all. Without this, readiness is
 *    either double-counted or capped below 100% forever.
 *    docs/03-data-model.md §4, §7.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const ROOT = new URL('..', import.meta.url).pathname;
const STANDARD_DIR = join(ROOT, 'standard');
const MANIFEST = join(STANDARD_DIR, 'upstream-manifest.json');

const problems = [];
const note = (message) => problems.push(message);

// --- 1. Integrity ----------------------------------------------------------

if (!existsSync(MANIFEST)) {
	note('standard/upstream-manifest.json is missing — the vendored copy has no provenance.');
} else {
	const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
	for (const [relative, expected] of Object.entries(manifest.files ?? {})) {
		const file = join(STANDARD_DIR, relative);
		if (!existsSync(file)) {
			note(`${relative}: listed in the manifest but not vendored.`);
			continue;
		}
		const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
		if (actual !== expected.sha256) {
			note(
				`${relative}: content does not match the published hash.\n` +
					'      Regenerate it in the RCOS-website repository and copy it here;\n' +
					'      the vendored copy is not a place to edit the standard.'
			);
		}
	}
}

// --- 2. The ownership invariant --------------------------------------------

const load = (id, version, name) =>
	yaml.load(readFileSync(join(STANDARD_DIR, id, version, `${name}.yaml`), 'utf8'));

const manifest = existsSync(MANIFEST)
	? JSON.parse(readFileSync(MANIFEST, 'utf8'))
	: { standards: [] };

for (const { id, version } of manifest.standards ?? []) {
	const clauses = load(id, version, 'clauses');
	const sections = load(id, version, 'sections');
	const artifacts = load(id, version, 'artifacts');

	const sectionKeys = new Set(sections.map((s) => s.key));
	const mandatoryArtifacts = new Set(artifacts.filter((a) => a.mandatory).map((a) => a.key));

	const ownerCount = new Map();
	for (const clause of clauses) {
		if (clause.owner) ownerCount.set(clause.ref, (ownerCount.get(clause.ref) ?? 0) + 1);
	}

	for (const clause of clauses) {
		const where = `${id}@${version} ${clause.ref}`;

		if (
			!['defined_by_section', 'satisfied_by_platform', 'not_a_definition'].includes(
				clause.disposition
			)
		) {
			note(`${where}: unknown disposition "${clause.disposition}".`);
			continue;
		}

		if (clause.disposition === 'defined_by_section') {
			if (!clause.owner) {
				if (clause.normativity === 'MUST') {
					note(`${where} (MUST): no owning section, and no disposition explaining why.`);
				}
				continue;
			}
			if (!sectionKeys.has(clause.owner)) {
				note(`${where}: owner "${clause.owner}" is not a section.`);
			}
			// A MUST owned by an optional artifact would put compliance out of reach
			// for a community that legitimately skips that artifact.
			const artifact = clause.owner.split('.')[0];
			if (clause.normativity === 'MUST' && !mandatoryArtifacts.has(artifact)) {
				note(
					`${where} (MUST): owned by "${clause.owner}", whose artifact is not mandatory — ` +
						'compliance would be unreachable for a community that skips it.'
				);
			}
		} else if (clause.owner) {
			note(`${where}: disposition is "${clause.disposition}" but it still has an owner.`);
		}
	}

	// Every section that claims to own a clause must be believed by that clause.
	for (const section of sections) {
		for (const ref of section.ownsClauses ?? []) {
			const clause = clauses.find((c) => c.ref === ref);
			if (!clause) {
				note(`${id}@${version} ${section.key}: owns "${ref}", which is not a clause.`);
			} else if (clause.owner !== section.key) {
				note(
					`${id}@${version} ${section.key}: claims to own ${ref}, but the clause names ` +
						`"${clause.owner}".`
				);
			}
		}
	}

	// --- 3. Compass's annotations -------------------------------------------
	//
	// Optional, but a broken one is worse than none: a Path item pointing at a
	// section that does not exist, or an ordering edge into nothing.
	const annotationsFile = join(STANDARD_DIR, id, version, 'annotations.yaml');
	if (existsSync(annotationsFile)) {
		const annotations = (yaml.load(readFileSync(annotationsFile, 'utf8')) ?? {}).sections ?? {};
		const efforts = new Set(['one_conversation', 'one_meeting', 'a_series']);
		for (const [key, annotation] of Object.entries(annotations)) {
			if (!sectionKeys.has(key)) {
				note(`${id}@${version} annotation "${key}": not a section.`);
				continue;
			}
			if (!annotation.question || annotation.question.trim().length === 0) {
				note(`${id}@${version} annotation "${key}": has no question.`);
			}
			if (!efforts.has(annotation.effort)) {
				note(`${id}@${version} annotation "${key}": unknown effort "${annotation.effort}".`);
			}
			for (const dependency of annotation.dependsOn ?? []) {
				if (!sectionKeys.has(dependency)) {
					note(
						`${id}@${version} annotation "${key}": depends on "${dependency}", which is not a section.`
					);
				}
				if (dependency === key) {
					note(`${id}@${version} annotation "${key}": depends on itself.`);
				}
			}
		}
	}

	const countable = clauses.filter(
		(c) => c.normativity === 'MUST' && c.disposition === 'defined_by_section'
	);
	console.log(
		'%s@%s  %d clauses · %d MUST · %d countable · %d artifacts (%d mandatory) · %d sections',
		id,
		version,
		clauses.length,
		clauses.filter((c) => c.normativity === 'MUST').length,
		countable.length,
		artifacts.length,
		mandatoryArtifacts.size,
		sections.length
	);
}

if (problems.length > 0) {
	console.error('\n%d problem(s) in the vendored standard:\n', problems.length);
	for (const problem of problems) console.error('  - ' + problem);
	process.exit(1);
}
