/**
 * RCOS as data. docs/09-standards-versions-modules.md.
 *
 * The shapes here mirror the YAML published by the RCOS-website repository. They
 * are deliberately not the database schema: a standard is shared, read-only
 * content, and a community's answers reference it by key.
 */

export type StandardId = string;
export type Version = string;
export type Locale = string;

export type Normativity = 'MUST' | 'SHOULD' | 'MAY' | 'INFORMATIVE';

/**
 * Why a clause exists in the count, or does not.
 *
 * `satisfied_by_platform` and `not_a_definition` are excluded from every
 * readiness denominator. Counting them would put a ceiling on readiness that no
 * community could ever reach — there is no text anyone could write that would
 * satisfy "Layer 2 artifacts MUST be versioned".
 */
export type Disposition = 'defined_by_section' | 'satisfied_by_platform' | 'not_a_definition';

export type Clause = {
	/** Document section number, exactly as published: `3.3.2`. */
	ref: string;
	/** Stable across renumbering; foreign keys point here, never at `ref`. */
	key: string;
	layer: number;
	specSection: { ref: string; title: string } | null;
	normativity: Normativity;
	disposition: Disposition;
	dispositionNote?: string | null;
	/** The one section that answers this clause. Null unless `defined_by_section`. */
	owner: string | null;
	/** Every section that cites it, owner included. Cross-references, for display. */
	referencedBy: string[];
	i18n: Record<Locale, string>;
};

/**
 * What a section *is*, as distinct from what it says. docs/12 §"An open question".
 *
 * Most sections are written by the community, and those are the only ones an
 * artifact's completeness may depend on. The rest exist in the template for
 * other reasons, and asking a community to fill them in would be 24 pieces of
 * busywork standing between them and compliance:
 *
 *  - `filled_from_decision` — every Ratification Record. Compass already holds
 *    one: the decision that adopted the artifact, with its mechanism and tally
 *    recorded at freeze time. Writing it a second time by hand is a chance for
 *    the two to disagree.
 *  - `derived` — a view over other sections (the Role Registry's summary table),
 *    generated so it cannot fall out of step with what it summarises.
 *  - `instance_record` — the *shape* of an entry that recurs, shown in the
 *    template as a specimen. One is written per event, not one per community.
 */
export type SectionDisposition =
	| 'authored'
	| 'filled_from_decision'
	| 'derived'
	| 'instance_record';

export type Section = {
	key: string;
	artifact: string;
	order: number;
	clauseRefs: string[];
	/** Refs this section owns. Derived upstream; the invariant is checked here too. */
	ownsClauses: string[];
	disposition: SectionDisposition;
	dispositionNote?: string | null;
	i18n: Record<
		Locale,
		{
			title: string;
			whyItMatters: string | null;
			whatToDefine: string | null;
			placeholders: string[];
		}
	>;
};

export type Artifact = {
	key: string;
	sourceId: string | null;
	layer: number | null;
	order: number;
	mandatory: boolean;
	sectionKeys: string[];
	i18n: Record<Locale, { title: string | null; summary: string | null }>;
};

export type GlossaryTerm = {
	key: string;
	i18n: Record<Locale, { term: string; definition: string }>;
};

export type StandardMeta = {
	standard: StandardId;
	version: Version;
	generated: string;
	licence: string;
	attribution: string;
	source: string;
	defaultLocale: Locale;
	locales: Locale[];
	layers: { n: number; name: string }[];
	counts: Record<string, number>;
};

/**
 * Compass's own annotation of a section. Not part of the standard: the plain
 * language, the effort estimate and the ordering edges are this tool's opinion,
 * and they are optional — a section without one still loads and is still
 * answerable.
 */
export type Effort = 'one_conversation' | 'one_meeting' | 'a_series';

export type Annotation = {
	question: string;
	effort: Effort;
	dependsOn: string[];
};

export type Standard = {
	meta: StandardMeta;
	clauses: Clause[];
	sections: Section[];
	artifacts: Artifact[];
	glossary: GlossaryTerm[];
	annotations: Record<string, Annotation>;
};

/** A localised string plus whether it fell back to the default locale. */
export type Localised<T> = { value: T; locale: Locale; isFallback: boolean };
