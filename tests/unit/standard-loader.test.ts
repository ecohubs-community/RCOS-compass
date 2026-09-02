import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	StandardView,
	UnknownStandardError,
	clearStandardViews,
	getStandard,
	loadStandard
} from '../../src/lib/server/standard/index.js';

const repoRoot = join(import.meta.dirname, '../..');
const standardRoot = join(repoRoot, 'standard');

let view: StandardView;

beforeEach(() => {
	clearStandardViews();
	view = getStandard('rcos-core', '0.1', { root: standardRoot });
});
afterEach(() => clearStandardViews());

describe('loading', () => {
	it('loads core 0.1 from the vendored copy', () => {
		expect(view.meta.standard).toBe('rcos-core');
		expect(view.meta.version).toBe('0.1');
		expect(view.clauses.length).toBeGreaterThan(0);
	});

	it('reports an unknown standard clearly rather than returning an empty one', () => {
		expect(() => loadStandard('rcos-module-permaculture', '0.1', { root: standardRoot })).toThrow(
			UnknownStandardError
		);
		expect(() => loadStandard('rcos-core', '9.9', { root: standardRoot })).toThrow(
			/No content for standard "rcos-core" version "9.9"/
		);
	});

	it('parses once and serves from cache', () => {
		const first = getStandard('rcos-core', '0.1', { root: standardRoot });
		const second = getStandard('rcos-core', '0.1', { root: standardRoot });
		expect(second).toBe(first);
	});

	it('carries its licence and attribution, which every export must repeat', () => {
		expect(view.meta.licence).toContain('CC BY 4.0');
		expect(view.meta.attribution).toContain('RCOS');
	});
});

describe('clause identity', () => {
	it('keeps the published document reference', () => {
		const clause = view.clauseByRef('3.3.2');
		expect(clause).toBeDefined();
		expect(clause!.ref).toBe('3.3.2');
	});

	it('derives the layer from the chapter, not from the ref', () => {
		// Chapter 3 is Layer 1; chapter 2 is Layer 0. A reader of the ref alone
		// would get this wrong, which is why `layer` is carried explicitly.
		expect(view.clauseByRef('3.3.2')!.layer).toBe(1);
		expect(view.clauseByRef('2.1.1')!.layer).toBe(0);
		expect(view.clauseByRef('8.1.1')!.layer).toBe(6);
	});

	it('resolves a clause by its stable key as well as its ref', () => {
		const byRef = view.clauseByRef('2.1.1')!;
		expect(view.clause(byRef.key)).toBe(byRef);
		// The key survives renumbering; the ref does not.
		expect(byRef.key).not.toBe(byRef.ref);
	});

	it('gives every clause a unique key and a unique ref', () => {
		const keys = new Set(view.clauses.map((c) => c.key));
		const refs = new Set(view.clauses.map((c) => c.ref));
		expect(keys.size).toBe(view.clauses.length);
		expect(refs.size).toBe(view.clauses.length);
	});
});

describe('the countable set', () => {
	it('is only MUST clauses a community can answer', () => {
		for (const clause of view.countableClauses()) {
			expect(clause.normativity).toBe('MUST');
			expect(clause.disposition).toBe('defined_by_section');
		}
	});

	it('excludes SHOULD and MAY, so answering optional things cannot inflate progress', () => {
		const countable = new Set(view.countableClauses().map((c) => c.ref));
		for (const clause of view.clauses) {
			if (clause.normativity === 'SHOULD' || clause.normativity === 'MAY') {
				expect(countable.has(clause.ref)).toBe(false);
			}
		}
	});

	it('excludes clauses no community answers, so 100% is reachable', () => {
		const counts = view.counts();
		expect(counts.satisfiedByPlatform).toBeGreaterThan(0);
		expect(counts.notADefinition).toBeGreaterThan(0);
		expect(counts.countable).toBe(counts.must - counts.satisfiedByPlatform - counts.notADefinition);
	});

	it('matches the figures the product spec quotes', () => {
		const counts = view.counts();
		expect(counts.clauses).toBe(213);
		expect(counts.must).toBe(185);
		expect(counts.countable).toBe(173);
		expect(counts.mandatoryArtifacts).toBe(21);
	});

	it('splits the countable set across all seven layers', () => {
		for (let layer = 0; layer <= 6; layer += 1) {
			expect(view.countableClausesInLayer(layer).length, `layer ${layer}`).toBeGreaterThan(0);
		}
	});
});

describe('the ownership invariant', () => {
	it('gives every countable clause exactly one owning section', () => {
		for (const clause of view.countableClauses()) {
			expect(clause.owner, `${clause.ref} has no owner`).toBeTruthy();
			expect(view.section(clause.owner!), `${clause.ref} owner is not a section`).toBeDefined();
		}
	});

	it('never lets a non-answerable clause have an owner', () => {
		for (const clause of view.clauses) {
			if (clause.disposition !== 'defined_by_section') {
				expect(clause.owner, `${clause.ref}`).toBeNull();
				expect(clause.dispositionNote, `${clause.ref} needs an explanation`).toBeTruthy();
			}
		}
	});

	it('never owns a MUST clause from a non-mandatory artifact', () => {
		// Otherwise a community that skips an optional artifact could never reach
		// compliance. In 0.1 this is the Experiment Template.
		const mandatory = new Set(view.mandatoryArtifacts().map((a) => a.key));
		for (const clause of view.countableClauses()) {
			expect(mandatory.has(clause.owner!.split('.')[0]!), `${clause.ref}`).toBe(true);
		}
	});

	it('keeps cross-references without granting ownership', () => {
		// 3.1.2 is cited by three artifacts and owned by one.
		const clause = view.clauseByRef('3.1.2')!;
		expect(clause.referencedBy.length).toBeGreaterThan(1);
		expect(clause.owner).toBe('membership-state-registry.defined-membership-states');
	});

	it('agrees in both directions: a section owns exactly what the clauses say', () => {
		for (const section of view.sections) {
			for (const ref of section.ownsClauses) {
				expect(view.clauseByRef(ref)!.owner).toBe(section.key);
			}
		}
	});
});

describe('artifacts and sections', () => {
	it('resolves an artifact to its sections in order', () => {
		const sections = view.sectionsOf('membership-agreement');
		expect(sections.length).toBeGreaterThan(0);
		expect(sections.map((s) => s.order)).toEqual(
			[...sections.map((s) => s.order)].sort((a, b) => a - b)
		);
	});

	it('carries the rationale and instructions the templates already wrote', () => {
		const section = view.sectionsOf('membership-agreement')[0]!;
		expect(section.i18n.en?.title).toBeTruthy();
		expect(section.i18n.en?.whyItMatters).toBeTruthy();
		expect(section.i18n.en?.whatToDefine).toBeTruthy();
	});

	it('marks exactly one artifact as optional', () => {
		const optional = view.artifacts.filter((a) => !a.mandatory);
		expect(optional.map((a) => a.key)).toEqual(['experiment-template']);
	});
});

describe('locales', () => {
	it('returns the requested locale when it exists', () => {
		const clause = view.clauseByRef('2.1.1')!;
		const de = view.clauseText(clause, 'de');
		expect(de.isFallback).toBe(false);
		expect(de.locale).toBe('de');
		expect(de.value).not.toBe(clause.i18n.en);
	});

	it('falls back to the default locale and says that it did', () => {
		const clause = view.clauseByRef('2.1.1')!;
		const missing = view.clauseText(clause, 'is');
		expect(missing.isFallback).toBe(true);
		expect(missing.locale).toBe('en');
		expect(missing.value).toBe(clause.i18n.en);
	});

	it('is not a fallback when the default locale is the one requested', () => {
		const clause = view.clauseByRef('2.1.1')!;
		expect(view.clauseText(clause, 'en').isFallback).toBe(false);
	});

	it('publishes every locale the standard declares', () => {
		expect(view.meta.locales).toEqual(['en', 'de', 'es', 'fr', 'pt-br']);
		const clause = view.clauseByRef('2.1.1')!;
		for (const locale of view.meta.locales) {
			expect(view.clauseText(clause, locale).isFallback, locale).toBe(false);
		}
	});
});

describe('many standards side by side', () => {
	it('loads a second standard id with no code change — the module door, proved open', () => {
		const dir = mkdtempSync(join(tmpdir(), 'compass-standards-'));
		try {
			cpSync(join(standardRoot, 'rcos-core'), join(dir, 'rcos-core'), { recursive: true });
			// A stand-in for a module: same shape, different id.
			cpSync(join(standardRoot, 'rcos-core'), join(dir, 'rcos-module-fake'), { recursive: true });
			const metaFile = join(dir, 'rcos-module-fake', '0.1', 'meta.yaml');
			writeFileSync(
				metaFile,
				readFileSync(metaFile, 'utf8').replace('standard: rcos-core', 'standard: rcos-module-fake')
			);

			const core = getStandard('rcos-core', '0.1', { root: dir });
			const module = getStandard('rcos-module-fake', '0.1', { root: dir });

			expect(core.meta.standard).toBe('rcos-core');
			expect(module.meta.standard).toBe('rcos-module-fake');
			expect(module).not.toBe(core);
			// Each is queried independently; neither collides with the other.
			expect(module.clauseByRef('2.1.1')).toBeDefined();
			expect(core.counts().countable).toBe(module.counts().countable);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe('the vendored copy is pinned to its source', () => {
	const run = () =>
		execFileSync('node', ['scripts/check-standard.mjs'], { cwd: repoRoot, encoding: 'utf8' });

	it('passes as vendored', () => {
		expect(() => run()).not.toThrow();
	});

	it('fails when a vendored file is edited by hand', () => {
		const file = join(standardRoot, 'rcos-core', '0.1', 'meta.yaml');
		const original = readFileSync(file, 'utf8');
		writeFileSync(file, original + '\n# edited by hand\n');
		try {
			run();
			expect.unreachable('the integrity check should have failed');
		} catch (error) {
			const output = String((error as { stdout?: string; stderr?: string }).stderr ?? '');
			expect(output).toContain('does not match the published hash');
			expect(output).toContain('not a place to edit the standard');
		} finally {
			writeFileSync(file, original);
		}
	});
}, 30_000);

describe('annotations', () => {
	it('covers Layers 0 and 1, which is what P3 needs', () => {
		const layer01 = view.artifacts
			.filter((a) => a.layer === 0 || a.layer === 1)
			.flatMap((a) => a.sectionKeys);
		for (const key of layer01) {
			expect(view.annotation(key), `${key} has no annotation`).toBeDefined();
		}
	});

	it('gives every annotation a question a member would recognise, and an effort', () => {
		for (const key of view.annotatedSectionKeys) {
			const annotation = view.annotation(key)!;
			expect(annotation.question.length, key).toBeGreaterThan(10);
			expect(['one_conversation', 'one_meeting', 'a_series']).toContain(annotation.effort);
		}
	});

	it('never annotates a section that does not exist', () => {
		for (const key of view.annotatedSectionKeys) {
			expect(view.section(key), key).toBeDefined();
		}
	});

	it('never points a dependency at a section that does not exist, or at itself', () => {
		for (const key of view.annotatedSectionKeys) {
			for (const dependency of view.annotation(key)!.dependsOn) {
				expect(view.section(dependency), `${key} -> ${dependency}`).toBeDefined();
				expect(dependency).not.toBe(key);
			}
		}
	});

	it('has no dependency cycles, so the Path can always be ordered', () => {
		const seen = new Map<string, 'visiting' | 'done'>();
		const visit = (key: string, trail: string[]) => {
			const state = seen.get(key);
			if (state === 'done') return;
			if (state === 'visiting') {
				throw new Error(`cycle: ${[...trail, key].join(' -> ')}`);
			}
			seen.set(key, 'visiting');
			for (const dependency of view.annotation(key)?.dependsOn ?? []) {
				visit(dependency, [...trail, key]);
			}
			seen.set(key, 'done');
		};
		expect(() => view.annotatedSectionKeys.forEach((k) => visit(k, []))).not.toThrow();
	});

	it('is optional — an unannotated section still loads and is answerable', () => {
		const unannotated = view.sections.find((s) => !view.annotation(s.key));
		expect(unannotated, 'Layers 2-6 are not annotated yet').toBeDefined();
		expect(unannotated!.i18n.en?.title).toBeTruthy();
	});
});

describe('100% is reachable', () => {
	/**
	 * The load-bearing test of this change. Before dispositions existed, the
	 * readiness denominator counted 12 clauses no community can answer, so a
	 * community would have ground toward a ceiling it could never touch. A
	 * governance tool that quietly makes success impossible is worse than one
	 * that does not measure at all.
	 */
	it('a community that adopts every section satisfies every countable clause', () => {
		const adopted = new Set(view.sections.map((s) => s.key));
		const unsatisfiable = view
			.countableClauses()
			.filter((clause) => !clause.owner || !adopted.has(clause.owner));
		expect(unsatisfiable.map((c) => c.ref)).toEqual([]);
	});

	it('every countable clause is owned by a section of a mandatory artifact', () => {
		// Adopting only the mandatory artifacts must be enough. Anything else would
		// make compliance depend on optional work.
		const mandatorySections = new Set(view.mandatoryArtifacts().flatMap((a) => a.sectionKeys));
		for (const clause of view.countableClauses()) {
			expect(mandatorySections.has(clause.owner!), `${clause.ref} -> ${clause.owner}`).toBe(true);
		}
	});

	it('a community that has adopted nothing is at zero, not at an error', () => {
		const satisfied = view.countableClauses().filter(() => false);
		expect(satisfied).toHaveLength(0);
		expect(view.countableClauses().length).toBeGreaterThan(0);
	});
});
