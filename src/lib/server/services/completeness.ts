import { and, eq, isNotNull } from 'drizzle-orm';
import type { Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { definition } from '../db/schema/definitions.js';
import { communityStandard } from '../db/schema/tenancy.js';
import { getStandard, type StandardView } from '../standard/index.js';

/**
 * Which artifacts a community has finished. docs/03-data-model.md §3b.
 *
 * The rule the whole phase turns on: **completeness counts only authored
 * sections.** Of RCOS-Core 0.1's 118 sections, 94 are authored; the other 24 are
 * Ratification Records the platform fills, a generated summary table, and
 * specimen entries that recur per event. Counting them would put 24 pieces of
 * busywork between a community and compliance, and would make an artifact
 * incomplete for want of text nobody is ever asked to write.
 *
 * Local definitions are outside this arithmetic entirely — they can neither
 * complete an artifact nor block one (§3a).
 */

export type ArtifactProgress = {
	artifactKey: string;
	authored: number;
	answered: number;
	complete: boolean;
	/** The authored sections still without an adopted version. */
	missing: string[];
};

/** The community's active standard row, and the loaded content behind it. */
export function activeStandardView(
	db: Db,
	ctx: Ctx
): { row: typeof communityStandard.$inferSelect; view: StandardView } | null {
	const row = db
		.select()
		.from(communityStandard)
		.where(
			and(
				eq(communityStandard.communityId, ctx.community.id),
				eq(communityStandard.status, 'active')
			)
		)
		.get();
	if (!row) return null;
	return { row, view: getStandard(row.standardId, row.version) };
}

/** Section keys this community has an adopted definition for. */
export function answeredSections(db: Db, communityStandardId: string): Set<string> {
	return new Set(
		db
			.select({ sectionKey: definition.sectionKey })
			.from(definition)
			.where(
				and(
					eq(definition.communityStandardId, communityStandardId),
					eq(definition.scope, 'standard'),
					isNotNull(definition.adoptedVersionId)
				)
			)
			.all()
			.map((row) => row.sectionKey!)
	);
}

export function artifactProgress(
	ctx: Ctx,
	artifactKey: string,
	options: { db?: Db } = {}
): ArtifactProgress {
	const db = options.db ?? getDb();
	const standard = activeStandardView(db, ctx);
	if (!standard) {
		return { artifactKey, authored: 0, answered: 0, complete: false, missing: [] };
	}

	const authored = standard.view.authoredSectionsOf(artifactKey);
	const answered = answeredSections(db, standard.row.id);
	const missing = authored.filter((section) => !answered.has(section.key)).map((s) => s.key);

	return {
		artifactKey,
		authored: authored.length,
		answered: authored.length - missing.length,
		// An artifact with nothing to write is not "complete"; it is a content bug
		// the standard checker already refuses, and reporting it as done here
		// would hide it.
		complete: authored.length > 0 && missing.length === 0,
		missing
	};
}

export function isArtifactComplete(
	ctx: Ctx,
	artifactKey: string,
	options: { db?: Db } = {}
): boolean {
	return artifactProgress(ctx, artifactKey, options).complete;
}

/** Every mandatory artifact still unfinished. The outward claim reads this. */
export function incompleteMandatoryArtifacts(
	ctx: Ctx,
	options: { db?: Db } = {}
): ArtifactProgress[] {
	const db = options.db ?? getDb();
	const standard = activeStandardView(db, ctx);
	if (!standard) return [];

	return standard.view
		.mandatoryArtifacts()
		.map((artifact) => artifactProgress(ctx, artifact.key, { db }))
		.filter((progress) => !progress.complete);
}

/**
 * The artifact whose adoption makes freezes final rather than provisional.
 *
 * docs/03-data-model.md §7: until a community has said how it decides, every
 * decision it records is provisional — it was taken under a rule that had not
 * been agreed yet.
 */
export const DECISION_MATRIX = 'decision-matrix';
