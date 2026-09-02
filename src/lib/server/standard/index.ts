import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';
import type {
	Annotation,
	Artifact,
	Clause,
	GlossaryTerm,
	Locale,
	Localised,
	Section,
	Standard,
	StandardId,
	StandardMeta,
	Version
} from './types.js';

export * from './types.js';

/**
 * Loads a standard from the vendored copy on disk.
 *
 * Vendored rather than fetched: a self-hosted instance works offline, CI needs no
 * network, and the exact bytes a community's decision records point at stay
 * reproducible. `scripts/check-standard.mjs` verifies the copy against the
 * upstream hashes.
 *
 * Addressed by `(standard_id, version)` throughout. Only core 0.1 exists today,
 * and nothing here assumes that — modules and a future core version should need
 * content and screens, not a migration.
 */

const DEFAULT_ROOT = 'standard';

export class UnknownStandardError extends Error {
	constructor(id: StandardId, version: Version, cause?: unknown) {
		super(
			`No content for standard "${id}" version "${version}". ` +
				`Expected it under ${DEFAULT_ROOT}/${id}/${version}/.`
		);
		this.name = 'UnknownStandardError';
		this.cause = cause;
	}
}

const cache = new Map<string, Standard>();

const cacheKey = (id: StandardId, version: Version) => `${id}@${version}`;

function readYaml<T>(root: string, id: StandardId, version: Version, name: string): T {
	const file = join(root, id, version, `${name}.yaml`);
	return yaml.load(readFileSync(file, 'utf8')) as T;
}

/** Annotations are Compass's own and optional; a standard without them loads. */
function readAnnotations(
	root: string,
	id: StandardId,
	version: Version
): Record<string, Annotation> {
	const file = join(root, id, version, 'annotations.yaml');
	if (!existsSync(file)) return {};
	const parsed = yaml.load(readFileSync(file, 'utf8')) as { sections?: Record<string, Annotation> };
	return parsed?.sections ?? {};
}

export function loadStandard(
	id: StandardId,
	version: Version,
	{ root = DEFAULT_ROOT, useCache = true } = {}
): Standard {
	const key = cacheKey(id, version);
	if (useCache) {
		const hit = cache.get(key);
		if (hit) return hit;
	}

	let standard: Standard;
	try {
		standard = {
			meta: readYaml<StandardMeta>(root, id, version, 'meta'),
			clauses: readYaml<Clause[]>(root, id, version, 'clauses'),
			sections: readYaml<Section[]>(root, id, version, 'sections'),
			artifacts: readYaml<Artifact[]>(root, id, version, 'artifacts'),
			glossary: readYaml<GlossaryTerm[]>(root, id, version, 'glossary'),
			annotations: readAnnotations(root, id, version)
		};
	} catch (error) {
		throw new UnknownStandardError(id, version, error);
	}

	if (useCache) cache.set(key, standard);
	return standard;
}

/** Test seam; application code never calls this. */
export function clearStandardCache(): void {
	cache.clear();
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/**
 * A queryable view over one standard. Indexes are built once per standard and
 * reused, so a page that resolves fifty clauses does fifty map lookups.
 */
export class StandardView {
	readonly meta: StandardMeta;
	readonly #clausesByKey = new Map<string, Clause>();
	readonly #clausesByRef = new Map<string, Clause>();
	readonly #sectionsByKey = new Map<string, Section>();
	readonly #artifactsByKey = new Map<string, Artifact>();
	readonly #glossaryByKey = new Map<string, GlossaryTerm>();

	constructor(private readonly standard: Standard) {
		this.meta = standard.meta;
		for (const clause of standard.clauses) {
			this.#clausesByKey.set(clause.key, clause);
			this.#clausesByRef.set(clause.ref, clause);
		}
		for (const section of standard.sections) this.#sectionsByKey.set(section.key, section);
		for (const artifact of standard.artifacts) this.#artifactsByKey.set(artifact.key, artifact);
		for (const term of standard.glossary) this.#glossaryByKey.set(term.key, term);
	}

	get clauses(): readonly Clause[] {
		return this.standard.clauses;
	}
	get sections(): readonly Section[] {
		return this.standard.sections;
	}
	get artifacts(): readonly Artifact[] {
		return this.standard.artifacts;
	}
	get glossary(): readonly GlossaryTerm[] {
		return this.standard.glossary;
	}

	/** Compass's plain-language question, effort tag and ordering edges. */
	annotation(sectionKey: string): Annotation | undefined {
		return this.standard.annotations[sectionKey];
	}

	get annotatedSectionKeys(): string[] {
		return Object.keys(this.standard.annotations);
	}

	clause(key: string): Clause | undefined {
		return this.#clausesByKey.get(key);
	}
	clauseByRef(ref: string): Clause | undefined {
		return this.#clausesByRef.get(ref);
	}
	section(key: string): Section | undefined {
		return this.#sectionsByKey.get(key);
	}
	artifact(key: string): Artifact | undefined {
		return this.#artifactsByKey.get(key);
	}
	term(key: string): GlossaryTerm | undefined {
		return this.#glossaryByKey.get(key);
	}

	sectionsOf(artifactKey: string): Section[] {
		const artifact = this.#artifactsByKey.get(artifactKey);
		if (!artifact) return [];
		return artifact.sectionKeys
			.map((key) => this.#sectionsByKey.get(key))
			.filter((s): s is Section => Boolean(s));
	}

	/**
	 * The clauses a community's readiness is measured against: MUST, and
	 * answerable by a community.
	 *
	 * docs/03-data-model.md §7. SHOULD and MAY are reported separately and never
	 * enter the percentage — otherwise answering optional things would raise it,
	 * which is the incentive RCOS exists to remove.
	 */
	countableClauses(): Clause[] {
		return this.standard.clauses.filter(
			(c) => c.normativity === 'MUST' && c.disposition === 'defined_by_section'
		);
	}

	countableClausesInLayer(layer: number): Clause[] {
		return this.countableClauses().filter((c) => c.layer === layer);
	}

	mandatoryArtifacts(): Artifact[] {
		return this.standard.artifacts.filter((a) => a.mandatory);
	}

	/** Every number the product shows is derived here, never hard-coded. */
	counts() {
		const clauses = this.standard.clauses;
		return {
			clauses: clauses.length,
			must: clauses.filter((c) => c.normativity === 'MUST').length,
			countable: this.countableClauses().length,
			should: clauses.filter((c) => c.normativity === 'SHOULD').length,
			may: clauses.filter((c) => c.normativity === 'MAY').length,
			satisfiedByPlatform: clauses.filter((c) => c.disposition === 'satisfied_by_platform').length,
			notADefinition: clauses.filter((c) => c.disposition === 'not_a_definition').length,
			artifacts: this.standard.artifacts.length,
			mandatoryArtifacts: this.mandatoryArtifacts().length,
			sections: this.standard.sections.length,
			glossary: this.standard.glossary.length
		};
	}

	/**
	 * Resolves localised content, falling back to the default locale and saying
	 * so. A missing translation must never render empty — a blank clause reads as
	 * a broken app, and a fallback that hides itself is worse.
	 */
	localise<T>(i18n: Record<Locale, T>, locale: Locale): Localised<T> {
		const wanted = i18n[locale];
		if (wanted !== undefined && wanted !== null) {
			return { value: wanted, locale, isFallback: false };
		}
		const fallbackLocale = this.meta.defaultLocale;
		return {
			value: i18n[fallbackLocale] as T,
			locale: fallbackLocale,
			isFallback: locale !== fallbackLocale
		};
	}

	clauseText(clause: Clause, locale: Locale): Localised<string> {
		return this.localise(clause.i18n, locale);
	}
}

const views = new Map<string, StandardView>();

export function getStandard(
	id: StandardId,
	version: Version,
	options?: { root?: string }
): StandardView {
	const key = cacheKey(id, version);
	let view = views.get(key);
	if (!view) {
		view = new StandardView(loadStandard(id, version, options));
		views.set(key, view);
	}
	return view;
}

export function clearStandardViews(): void {
	views.clear();
	cache.clear();
}
