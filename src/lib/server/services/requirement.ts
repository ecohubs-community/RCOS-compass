import type { Locale, Normativity, StandardView } from '../standard/index.js';

/**
 * What the standard asks of one section — the "The requirement" column of
 * design artboard 03, read the same way wherever it appears: the definition
 * page's left column and the sheet a discussion opens from a clause reference.
 *
 * Everything here is the standard's own text or its own structure. In
 * particular "What NOT to define here" is *derived*: the vendored standard has
 * no such prose, so it lists what the standard assigns to other sections — the
 * sibling sections of the same template, and the owners of the clauses this
 * section only references. A Compass-written sentence under an RCOS heading
 * would be the tool speaking for the standard.
 *
 * Pure over a loaded view, like the loader it reads: the pages calling it have
 * already passed their permission check reading the community.
 */

export type CitedClause = { key: string; ref: string; owned: boolean };

export type RequirementClause = CitedClause & {
	normativity: Normativity;
	body: string;
};

export type ElsewhereSection = {
	sectionKey: string;
	title: string;
	question: string;
	/** The countable clauses it owns — what it answers in place of this one. */
	refs: string[];
};

export type Requirement = {
	/** "RCOS-Core v0.1", printed before each clause as artboard 03 does. */
	standard: string;
	sectionKey: string;
	title: string;
	artifactTitle: string | null;
	/** Owned first, then referenced; each in the standard's order. */
	clauses: RequirementClause[];
	whyItMatters: string | null;
	whatToDefine: string | null;
	notHere: ElsewhereSection[];
};

const STANDARD_NAMES: Record<string, string> = { 'rcos-core': 'RCOS-Core' };

/** "RCOS-Core v0.1" — a standard by the name members read, not its id. */
export function standardName(view: StandardView): string {
	return `${STANDARD_NAMES[view.meta.standard] ?? view.meta.standard} v${view.meta.version}`;
}

/** Standard order for refs like `3.6.10` — string order puts it before `3.6.2`. */
export function compareRefs(a: string, b: string): number {
	const x = a.split('.').map(Number);
	const y = b.split('.').map(Number);
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		const d = (x[i] ?? -1) - (y[i] ?? -1);
		if (d !== 0) return d;
	}
	return 0;
}

/**
 * Every clause a section cites: owned first, then only referenced.
 *
 * Owned includes MAY and INFORMATIVE clauses — the reader is checking a
 * question against the text, and the normativity travels with each clause
 * wherever the text is shown.
 */
export function citedClauses(view: StandardView, sectionKey: string): CitedClause[] {
	const section = view.section(sectionKey);
	if (!section) return [];
	const cited = section.clauseRefs
		.map((ref) => view.clauseByRef(ref))
		.filter((clause) => clause !== undefined)
		.map((clause) => ({ key: clause.key, ref: clause.ref, owned: clause.owner === sectionKey }));
	const byRef = (a: CitedClause, b: CitedClause) => compareRefs(a.ref, b.ref);
	return [
		...cited.filter((c) => c.owned).sort(byRef),
		...cited.filter((c) => !c.owned).sort(byRef)
	];
}

/** The Path's plain-language question for a section, or its title when it has none. */
export function questionFor(view: StandardView, sectionKey: string, locale: Locale): string {
	const section = view.section(sectionKey);
	return (
		view.annotation(sectionKey)?.question ??
		(section ? view.localise(section.i18n, locale).value.title : sectionKey)
	);
}

function countableOwnedRefs(view: StandardView, sectionKey: string): string[] {
	return view
		.countableClauses()
		.filter((clause) => clause.owner === sectionKey)
		.map((clause) => clause.ref)
		.sort(compareRefs);
}

export function requirementFor(
	view: StandardView,
	sectionKey: string,
	locale: Locale
): Requirement | null {
	const section = view.section(sectionKey);
	if (!section) return null;
	const localised = view.localise(section.i18n, locale).value;
	const artifact = view.artifact(section.artifact);

	const clauses = citedClauses(view, sectionKey).map((cited) => {
		const clause = view.clause(cited.key)!;
		return {
			...cited,
			normativity: clause.normativity,
			body: view.clauseText(clause, locale).value
		};
	});

	// Siblings in the template's order, then whoever owns what this section only
	// leans on. Authored only: a Ratification Record is not somewhere a
	// community is told to write anything.
	const elsewhere: string[] = view
		.authoredSectionsOf(section.artifact)
		.map((s) => s.key)
		.filter((key) => key !== sectionKey);
	for (const cited of clauses.filter((c) => !c.owned)) {
		const owner = view.clause(cited.key)?.owner;
		if (!owner || owner === sectionKey || elsewhere.includes(owner)) continue;
		if (view.section(owner)?.disposition !== 'authored') continue;
		elsewhere.push(owner);
	}

	return {
		standard: standardName(view),
		sectionKey,
		title: localised.title,
		artifactTitle: artifact ? view.localise(artifact.i18n, locale).value.title : null,
		clauses,
		whyItMatters: localised.whyItMatters,
		whatToDefine: localised.whatToDefine,
		notHere: elsewhere.map((key) => ({
			sectionKey: key,
			title: view.localise(view.section(key)!.i18n, locale).value.title,
			question: questionFor(view, key, locale),
			refs: countableOwnedRefs(view, key)
		}))
	};
}
