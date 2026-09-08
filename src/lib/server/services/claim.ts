import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { communityOf, type Reader } from '../auth/audience.js';
import { requireRead } from '../auth/visible-to.js';
import { getDb, type Db } from '../db/index.js';
import { definition } from '../db/schema/definitions.js';
import { selfAudit } from '../db/schema/self-audit.js';
import { communityStandard } from '../db/schema/tenancy.js';
import { getStandard } from '../standard/index.js';
import { answeredSections } from './completeness.js';
import { communityLocale } from './community-locale.js';

/**
 * What a community says about itself outwardly. UI spec §1.4, RCOS §10.1.1.
 *
 * The percentage is the product's motivational engine and it must never leave
 * the building. If "73% compliant" reaches community websites the word
 * compliant stops meaning anything and the standard loses its only enforcement
 * mechanism — its definition. That is the one failure in this phase which
 * cannot be walked back, because it ends up in other people's screenshots.
 *
 * So the guard is **structural rather than remembered**. This module returns a
 * type with no number on it anywhere: not a percentage, not a count of answered
 * sections, not the pair of integers a percentage is one division away from.
 * `ArtifactProgress` — which the inward figures use — carries `authored` and
 * `answered`, so it deliberately does not appear here. A rule saying "do not put
 * the percentage on the public page" survives until somebody adds a summary
 * card; a field that does not exist cannot be rendered by accident.
 */

export type OutwardClaim = {
	standardId: string;
	version: string;
	/** Yes or no. RCOS §10.1.1 admits no third answer and no gradient. */
	compliant: boolean;
	/**
	 * What is missing, named. A bare "not compliant" is a claim nobody can act
	 * on; the list is what makes it a statement about work rather than a verdict.
	 */
	missing: { artifactKey: string; title: string }[];
	/** Adopted before the community had agreed how it decides. RCOS §10.3.4. */
	provisionalDefinitions: number;
	/** When the community last ran a self-audit, and null when it never has. */
	lastAuditAt: number | null;
};

export function outwardClaim(reader: Reader, options: { db?: Db } = {}): OutwardClaim | null {
	const audience = requireRead(reader);
	const db = options.db ?? getDb();
	const communityId = communityOf(audience);

	const core = db
		.select()
		.from(communityStandard)
		.where(
			and(
				eq(communityStandard.communityId, communityId),
				eq(communityStandard.status, 'active'),
				eq(communityStandard.standardId, 'rcos-core')
			)
		)
		.get();
	if (!core) return null;

	const view = getStandard(core.standardId, core.version);
	const locale = communityLocale(db, communityId);
	const answered = answeredSections(db, core.id);

	const missing = view
		.mandatoryArtifacts()
		.filter((artifact) =>
			view.authoredSectionsOf(artifact.key).some((section) => !answered.has(section.key))
		)
		.map((artifact) => ({
			artifactKey: artifact.key,
			title: view.localise(artifact.i18n, locale).value.title ?? artifact.key
		}));

	const provisionalDefinitions = db
		.select({ id: definition.id })
		.from(definition)
		.where(
			and(
				eq(definition.communityStandardId, core.id),
				eq(definition.provisional, true),
				isNotNull(definition.adoptedVersionId)
			)
		)
		.all().length;

	return {
		standardId: core.standardId,
		version: core.version,
		compliant: missing.length === 0 && provisionalDefinitions === 0,
		missing,
		provisionalDefinitions,
		lastAuditAt: lastAudit(db, communityId)
	};
}

/**
 * The self-audit date the public index cites (RCOS Appendix C.5).
 *
 * Read here rather than joined into the claim by the caller, so a surface that
 * shows the claim cannot show it without the date — "compliant" with no
 * indication of when anybody last checked is the shape of assertion the
 * appendix exists to prevent.
 */
function lastAudit(db: Db, communityId: string): number | null {
	const row = db
		.select({ runAt: selfAudit.runAt })
		.from(selfAudit)
		.where(eq(selfAudit.communityId, communityId))
		.orderBy(desc(selfAudit.runAt))
		.get();
	return row?.runAt.getTime() ?? null;
}
