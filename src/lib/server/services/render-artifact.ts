import { and, eq, inArray } from 'drizzle-orm';
import { communityOf, type Audience } from '../auth/audience.js';
import { visibleTo } from '../auth/visible-to.js';
import type { Db } from '../db/index.js';
import { decision } from '../db/schema/decisions.js';
import { community } from '../db/schema/tenancy.js';
import { isoDateIn } from '../../time/format.js';
import { timeZoneFor } from '../../time/zone.js';
import { definition, definitionVersion } from '../db/schema/definitions.js';
import type { Locale } from '../standard/types.js';
import { standardViewFor } from './completeness.js';
import { communityLocale } from './community-locale.js';

/**
 * An artifact as a document. UI spec §4.8.
 *
 * The public page, the export's Markdown, the PDF and the mirrored commit are
 * the same operation — *render this artifact, with its adopted definitions, its
 * local additions and its provenance*. Built once here, with thin adapters per
 * destination, because the alternative is three implementations that agree on
 * the day they are written and diverge quietly afterwards.
 *
 * That matters more here than it usually would. The self-audit exists so a
 * community can show an outsider what is true; three renderings that disagree
 * is exactly what an auditor would find, and exactly what the product cannot
 * afford to be caught doing.
 *
 * Everything below goes through `visibleTo`, so a rendering contains only what
 * its audience may read — an export made by somebody who cannot see a
 * restricted definition does not contain it, and neither does the public page.
 */

export type RenderedSection = {
	key: string;
	title: string;
	/** The community's adopted text, or null where they have not decided yet. */
	body: string | null;
	/** How it was adopted, so a reader can check rather than trust. */
	adopted: { decisionRef: string | null; adoptedAt: number } | null;
	provisional: boolean;
};

export type RenderedAddition = {
	title: string;
	body: string;
	/**
	 * Always present, always the same sentence. UI spec §4.8: leaving local
	 * items out makes an export a misrepresentation of how a community governs
	 * itself, and including them unlabelled lets an outsider read a house rule as
	 * a standard requirement. An auditor must be able to tell at a glance, and so
	 * must a new member.
	 */
	label: string;
};

export type RenderedArtifact = {
	key: string;
	title: string;
	layer: number | null;
	mandatory: boolean;
	standard: { id: string; version: string };
	/** The community's zone, which its record's dates are written in. */
	timeZone: string;
	sections: RenderedSection[];
	localAdditions: RenderedAddition[];
};

export const additionLabel = (standardId: string, version: string) =>
	`community addition — not required by ${standardId} v${version}`;

export function renderArtifact(
	db: Db,
	audience: Audience,
	artifactKey: string
): RenderedArtifact | null {
	const communityId = communityOf(audience);
	const standard = standardViewFor(db, communityId);
	if (!standard) return null;

	const artifact = standard.view.artifact(artifactKey);
	if (!artifact) return null;

	const locale = communityLocale(db, communityId);
	const localised = <T>(i18n: Record<Locale, T>) => standard.view.localise(i18n, locale).value;

	// One query for the community's definitions of this artifact's sections,
	// filtered by audience, rather than one per section.
	const sectionKeys = standard.view.authoredSectionsOf(artifactKey).map((section) => section.key);
	const rows =
		sectionKeys.length === 0
			? []
			: db
					.select()
					.from(definition)
					.where(
						and(
							eq(definition.communityId, communityId),
							eq(definition.scope, 'standard'),
							inArray(definition.sectionKey, sectionKeys),
							visibleTo(audience, definition.visibility)
						)
					)
					.all();

	const versions = versionsOf(db, rows);
	const refs = decisionRefs(db, communityId, [...versions.values()]);
	const bySection = new Map(rows.map((row) => [row.sectionKey!, row]));

	const sections = standard.view.authoredSectionsOf(artifactKey).map((section) => {
		const own = bySection.get(section.key);
		const version = own?.adoptedVersionId ? versions.get(own.adoptedVersionId) : undefined;
		return {
			key: section.key,
			title: localised(section.i18n).title ?? section.key,
			body: version?.body ?? null,
			adopted: version
				? {
						decisionRef: version.decisionId ? (refs.get(version.decisionId) ?? null) : null,
						adoptedAt: (version.adoptedAt ?? version.createdAt).getTime()
					}
				: null,
			provisional: own?.provisional ?? false
		};
	});

	return {
		key: artifactKey,
		title: localised(artifact.i18n).title ?? artifactKey,
		layer: artifact.layer,
		mandatory: artifact.mandatory,
		standard: { id: standard.row.standardId, version: standard.row.version },
		timeZone: timeZoneFor(
			null,
			db
				.select({ timezone: community.timezone })
				.from(community)
				.where(eq(community.id, communityId))
				.get()
		),
		sections,
		localAdditions: localAdditions(db, audience, artifactKey, standard.row)
	};
}

/** Local definitions attached to this RCOS artifact — UI spec §1.4b's extensions. */
function localAdditions(
	db: Db,
	audience: Audience,
	artifactKey: string,
	standardRow: { standardId: string; version: string }
): RenderedAddition[] {
	const rows = db
		.select()
		.from(definition)
		.where(
			and(
				eq(definition.communityId, communityOf(audience)),
				eq(definition.scope, 'local'),
				eq(definition.attachKind, 'rcos_artifact'),
				eq(definition.attachRcosArtifactKey, artifactKey),
				visibleTo(audience, definition.visibility)
			)
		)
		.all();

	const versions = versionsOf(db, rows);
	const label = additionLabel(standardRow.standardId, standardRow.version);

	return rows.flatMap((row) => {
		const version = row.adoptedVersionId ? versions.get(row.adoptedVersionId) : undefined;
		if (!version) return [];
		return [{ title: row.title ?? '', body: version.body, label }];
	});
}

function versionsOf(db: Db, rows: { adoptedVersionId: string | null }[]) {
	const ids = rows.map((row) => row.adoptedVersionId).filter((id): id is string => id !== null);
	if (ids.length === 0) return new Map<string, typeof definitionVersion.$inferSelect>();
	return new Map(
		db
			.select()
			.from(definitionVersion)
			.where(inArray(definitionVersion.id, ids))
			.all()
			.map((row) => [row.id, row])
	);
}

function decisionRefs(
	db: Db,
	communityId: string,
	versions: { decisionId: string | null }[]
): Map<string, string> {
	const ids = versions.map((v) => v.decisionId).filter((id): id is string => id !== null);
	if (ids.length === 0) return new Map();
	return new Map(
		db
			.select({ id: decision.id, ref: decision.ref })
			.from(decision)
			.where(and(eq(decision.communityId, communityId), inArray(decision.id, ids)))
			.all()
			.map((row) => [row.id, row.ref])
	);
}

/**
 * The Markdown adapter, for the export bundle and the git mirror.
 *
 * Plain enough to read in a terminal and structured enough for a converter:
 * headings, paragraphs, and the provenance on its own line. No front matter and
 * no HTML — a file somebody opens in five years with no Compass and no internet
 * (`docs/10` §1.3) should not need a parser.
 */
export function artifactToMarkdown(rendered: RenderedArtifact): string {
	const lines: string[] = [`# ${rendered.title}`, ''];
	if (rendered.layer !== null) lines.push(`Layer ${rendered.layer}`, '');
	lines.push(`Standard: ${rendered.standard.id} v${rendered.standard.version}`, '');

	for (const section of rendered.sections) {
		lines.push(`## ${section.title}`, '');
		if (section.body) {
			lines.push(section.body, '');
			const provenance = [
				section.adopted?.decisionRef ? `Adopted by ${section.adopted.decisionRef}` : 'Adopted',
				section.adopted ? isoDateIn(section.adopted.adoptedAt, rendered.timeZone) : null,
				section.provisional ? 'provisional' : null
			]
				.filter(Boolean)
				.join(' · ');
			lines.push(`*${provenance}*`, '');
		} else {
			lines.push('*Not yet decided by this community.*', '');
		}
	}

	if (rendered.localAdditions.length > 0) {
		lines.push('## Local additions', '');
		for (const addition of rendered.localAdditions) {
			lines.push(`### ${addition.title}`, '', addition.body, '', `*${addition.label}*`, '');
		}
	}

	return lines.join('\n');
}
