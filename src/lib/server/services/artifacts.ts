import { and, eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { ctxCan, requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { definition } from '../db/schema/definitions.js';
import type { DefinitionStatus } from '../../shared/definition-status.js';
import { activeStandardView, answeredSections, progressOf } from './completeness.js';
import { restrictedInClosedLayers } from './layer-checks.js';
import { statusesBySection } from './provenance.js';
import { publicationHistory, type PublicationEvent } from './publishing.js';
import { compareRefs, questionFor } from './requirement.js';

/**
 * One page per artifact (UI spec §4.8, design artboard 15): the sections it
 * requires and what answers each, the community's own additions kept apart,
 * completeness as counts and a share of sections, what stands between it and
 * complete, and its publication.
 *
 * Counts come from `progressOf`, the function readiness and the Artifacts list
 * use, so the page cannot say "5 of 8" while the list says "4 of 8". Local
 * additions never enter them (docs/03 §3a). A restricted definition the reader
 * may not see shows as answered and restricted, with no title or link — what
 * the layer checks already reveal, and no more (`provenance-ui` D14).
 */

export type ArtifactSection = {
	key: string;
	title: string;
	question: string;
	refs: string[];
	/** Written by the community, and so counted. Records and summaries are listed, not counted. */
	counted: boolean;
	definitionId: string | null;
	status: DefinitionStatus;
	provisional: boolean;
	restricted: boolean;
};

export type Blocker =
	| { kind: 'missing'; sectionKey: string; title: string; question: string }
	| { kind: 'provisional'; sectionKey: string; title: string; definitionId: string | null }
	| { kind: 'restricted'; sectionKey: string; title: string; definitionId: string | null }
	| { kind: 'open_proposal'; sectionKey: string; title: string; definitionId: string };

export type ArtifactDetail = {
	key: string;
	title: string;
	summary: string | null;
	layer: number | null;
	layerName: string | null;
	mandatory: boolean;
	sections: ArtifactSection[];
	local: { definitionId: string; title: string; adopted: boolean }[];
	answered: number;
	authored: number;
	/** Of sections answered — inward only, never compliance (`provenance-ui` D4). */
	percent: number;
	complete: boolean;
	blockers: Blocker[];
	/** Every adopted answer is world-readable, some are, or none. */
	publication: 'public' | 'partly' | 'internal' | 'nothing_adopted';
	history: PublicationEvent[];
};

export function artifactDetail(ctx: Ctx, key: string, options: { db?: Db } = {}): ArtifactDetail {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	const standard = activeStandardView(db, ctx);
	const artifact = standard?.view.artifact(key);
	// An artifact the adopted standard does not have answers like one from
	// another community: not found.
	if (!standard || !artifact) error(404, 'Not found');
	const { view } = standard;
	const locale = ctx.community.locale;
	const seeRestricted = ctxCan(ctx, 'exception.read');

	const answered = answeredSections(db, standard.row.id);
	const progress = progressOf(standard, key, answered);
	const statuses = statusesBySection(ctx, { db });
	const rows = new Map(
		db
			.select()
			.from(definition)
			.where(
				and(
					eq(definition.communityId, ctx.community.id),
					eq(definition.communityStandardId, standard.row.id)
				)
			)
			.all()
			.map((row) => [row.sectionKey, row])
	);
	const authoredKeys = new Set(view.authoredSectionsOf(key).map((section) => section.key));

	const sections: ArtifactSection[] = view.sectionsOf(key).map((section) => {
		const row = rows.get(section.key);
		const restricted = row?.visibility === 'restricted';
		const hidden = restricted && !seeRestricted;
		return {
			key: section.key,
			title: view.localise(section.i18n, locale).value.title,
			question: questionFor(view, section.key, locale),
			refs: view.clauses
				.filter((clause) => clause.owner === section.key)
				.map((clause) => clause.ref)
				.sort(compareRefs),
			counted: authoredKeys.has(section.key),
			definitionId: hidden ? null : (row?.id ?? null),
			status: statuses.get(section.key)?.status ?? 'not_started',
			provisional: row?.provisional ?? false,
			restricted
		};
	});

	const local = db
		.select()
		.from(definition)
		.where(
			and(
				eq(definition.communityId, ctx.community.id),
				eq(definition.scope, 'local'),
				eq(definition.attachRcosArtifactKey, key)
			)
		)
		.all()
		.filter((row) => row.visibility !== 'restricted' || seeRestricted)
		.map((row) => ({
			definitionId: row.id,
			title: row.title ?? 'Untitled',
			adopted: row.adoptedVersionId !== null
		}));

	// The three things compliance reads, then work already under way.
	const restrictedHere = new Set(
		restrictedInClosedLayers(db, ctx.community.id, standard.row.id, view)
			.filter((entry) => authoredKeys.has(entry.sectionKey))
			.map((entry) => entry.sectionKey)
	);
	const counted = sections.filter((section) => section.counted);
	const blockers: Blocker[] = [
		...counted
			.filter((section) => !answered.has(section.key))
			.map((section) => ({
				kind: 'missing' as const,
				sectionKey: section.key,
				title: section.title,
				question: section.question
			})),
		...counted
			.filter((section) => answered.has(section.key) && section.provisional)
			.map((section) => ({
				kind: 'provisional' as const,
				sectionKey: section.key,
				title: section.title,
				definitionId: section.definitionId
			})),
		...counted
			.filter((section) => restrictedHere.has(section.key))
			.map((section) => ({
				kind: 'restricted' as const,
				sectionKey: section.key,
				title: section.title,
				definitionId: section.definitionId
			})),
		...counted
			.filter(
				(section) =>
					section.definitionId !== null &&
					answered.has(section.key) &&
					statuses.get(section.key)?.rediscussed
			)
			.map((section) => ({
				kind: 'open_proposal' as const,
				sectionKey: section.key,
				title: section.title,
				definitionId: section.definitionId!
			}))
	];

	const adoptedHere = [...rows.values()].filter(
		(row) =>
			row.scope === 'standard' && row.adoptedVersionId !== null && authoredKeys.has(row.sectionKey!)
	);
	const world = adoptedHere.filter((row) => row.visibility === 'world').length;

	return {
		key,
		title: view.localise(artifact.i18n, locale).value.title ?? key,
		summary: view.localise(artifact.i18n, locale).value.summary ?? null,
		layer: artifact.layer,
		layerName:
			artifact.layer === null
				? null
				: (view.meta.layers.find((entry) => entry.n === artifact.layer)?.name ?? null),
		mandatory: artifact.mandatory,
		sections,
		local,
		answered: progress.answered,
		authored: progress.authored,
		percent:
			progress.authored === 0 ? 0 : Math.round((progress.answered / progress.authored) * 100),
		complete: progress.complete,
		blockers,
		publication:
			adoptedHere.length === 0
				? 'nothing_adopted'
				: world === adoptedHere.length
					? 'public'
					: world > 0
						? 'partly'
						: 'internal',
		history: publicationHistory(ctx, key, { db })
	};
}
