import { error } from '@sveltejs/kit';
import { and, desc, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import { requirePermission, type Ctx } from '../auth/guard.js';
import { getDb, type Db } from '../db/index.js';
import { newId } from '../db/id.js';
import { decision } from '../db/schema/decisions.js';
import { clauseCoverage, definition, definitionVersion } from '../db/schema/definitions.js';
import { selfAudit, type SelfAudit } from '../db/schema/self-audit.js';
import { transparencyException } from '../db/schema/visibility.js';
import { activeStandardView, answeredSections } from './completeness.js';
import { readiness } from './readiness.js';

/**
 * "We checked ourselves on this date, and here is what we found."
 * UI spec §4.8, RCOS §10.1 and Appendix C.5.
 *
 * **It is a record, not a computation.** Readiness is always live and the audit
 * recomputes nothing — what it does is fix a moment, with who ran it, so a
 * community can cite it. That is what the standard asks for and what the public
 * index shows the date of.
 *
 * Two things it deliberately is not (UI spec §4.8). It is not an approval:
 * nobody is certified by pressing a button. And it is not an AI judgement:
 * every line below is read out of a table, so two people running it on the same
 * state get the same answer, and an instance with no model configured produces
 * exactly the same result as one with a model.
 */

export type AuditSnapshot = {
	standardId: string;
	version: string;
	/** Named, not counted: "four artifacts missing" is not something to act on. */
	incompleteArtifacts: { key: string; title: string; missing: string[] }[];
	/** Countable MUSTs with no owning definition adopted. */
	uncoveredClauses: { key: string; ref: string }[];
	/** Adopted before the community had a Decision Matrix, with what it was adopted under. */
	provisional: { definitionId: string; sectionKey: string | null; adoptedAt: number | null }[];
	/** Past its review date, still adopted, still counting. */
	pastReview: { definitionId: string; sectionKey: string | null; reviewDueAt: number }[];
	/** Frozen anyway, which the register shows and an auditor asks about. */
	decisionsOverObjections: { ref: string; unresolved: number }[];
	/** What is hidden, from whom, and until when. */
	exceptions: {
		subjectType: string;
		subjectId: string;
		justification: string;
		expiresAt: number;
	}[];
	/**
	 * The community's own rules going stale.
	 *
	 * Listed separately and marked, because RCOS does not care about them and a
	 * community does. Folding them in would make the audit say a community is
	 * further from compliance than it is.
	 */
	localPastReview: { definitionId: string; title: string | null; reviewDueAt: number }[];
	/** For the community's own use. Never leaves the building. */
	readiness: { percent: number; layers: { layer: number; percent: number | null }[] } | null;
};

export function runSelfAudit(ctx: Ctx, options: { db?: Db } = {}): SelfAudit {
	requirePermission(ctx, 'audit.run');

	const db = options.db ?? getDb();
	const now = ctx.now();
	const standard = activeStandardView(db, ctx);
	if (!standard) {
		// A refusal, not a crash. A steward who reaches this has simply not adopted
		// a standard yet, and a 500 tells them the product is broken instead.
		error(409, 'Adopt a standard before running a self-audit — there is nothing to audit yet.');
	}

	const answered = answeredSections(db, standard.row.id);
	const locale = ctx.community.locale as 'en';

	const incompleteArtifacts = standard.view
		.mandatoryArtifacts()
		.map((artifact) => ({
			key: artifact.key,
			title: standard.view.localise(artifact.i18n, locale).value.title ?? artifact.key,
			missing: standard.view
				.authoredSectionsOf(artifact.key)
				.filter((section) => !answered.has(section.key))
				.map((section) => section.key)
		}))
		.filter((artifact) => artifact.missing.length > 0);

	const covered = new Set(
		db
			.select({ clauseKey: clauseCoverage.clauseKey })
			.from(clauseCoverage)
			.where(eq(clauseCoverage.communityStandardId, standard.row.id))
			.all()
			.map((row) => row.clauseKey)
	);
	const uncoveredClauses = standard.view
		.countableClauses()
		.filter((clause) => !covered.has(clause.key))
		.map((clause) => ({ key: clause.key, ref: clause.ref }));

	const adopted = db
		.select()
		.from(definition)
		.where(
			and(eq(definition.communityId, ctx.community.id), isNotNull(definition.adoptedVersionId))
		)
		.all();

	const provisional = adopted
		.filter((row) => row.provisional && row.scope === 'standard')
		.map((row) => ({
			definitionId: row.id,
			sectionKey: row.sectionKey,
			adoptedAt: adoptedAtOf(db, row.adoptedVersionId)
		}));

	const pastReview = adopted
		.filter((row) => row.scope === 'standard' && row.reviewDueAt && row.reviewDueAt.getTime() < now)
		.map((row) => ({
			definitionId: row.id,
			sectionKey: row.sectionKey,
			reviewDueAt: row.reviewDueAt!.getTime()
		}));

	const localPastReview = adopted
		.filter((row) => row.scope === 'local' && row.reviewDueAt && row.reviewDueAt.getTime() < now)
		.map((row) => ({
			definitionId: row.id,
			title: row.title,
			reviewDueAt: row.reviewDueAt!.getTime()
		}));

	const decisionsOverObjections = db
		.select({ ref: decision.ref, unresolved: decision.unresolvedObjections })
		.from(decision)
		.where(and(eq(decision.communityId, ctx.community.id), gt(decision.unresolvedObjections, 0)))
		.all()
		.map((row) => ({ ref: row.ref, unresolved: row.unresolved }));

	const exceptions = db
		.select()
		.from(transparencyException)
		.where(
			and(
				eq(transparencyException.communityId, ctx.community.id),
				isNull(transparencyException.expiredAt)
			)
		)
		.all()
		.map((row) => ({
			subjectType: row.subjectType,
			subjectId: row.subjectId,
			justification: row.justification,
			expiresAt: row.expiresAt.getTime()
		}));

	const numbers = readiness(ctx, { db });

	const snapshot: AuditSnapshot = {
		standardId: standard.row.standardId,
		version: standard.row.version,
		incompleteArtifacts,
		uncoveredClauses,
		provisional,
		pastReview,
		decisionsOverObjections,
		exceptions,
		localPastReview,
		readiness: numbers
			? {
					percent: numbers.percent,
					layers: numbers.layers.map((layer) => ({ layer: layer.layer, percent: layer.percent }))
				}
			: null
	};

	const id = newId();
	db.insert(selfAudit)
		.values({
			id,
			communityId: ctx.community.id,
			runBy: ctx.user.id,
			runAt: new Date(now),
			compliant: incompleteArtifacts.length === 0 && provisional.length === 0,
			snapshot
		})
		.run();

	return db.select().from(selfAudit).where(eq(selfAudit.id, id)).get()!;
}

/** Every audit this community has run, newest first. */
export function listSelfAudits(ctx: Ctx, options: { db?: Db } = {}): SelfAudit[] {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	return db
		.select()
		.from(selfAudit)
		.where(eq(selfAudit.communityId, ctx.community.id))
		.orderBy(desc(selfAudit.runAt))
		.all();
}

function adoptedAtOf(db: Db, versionId: string | null): number | null {
	if (!versionId) return null;
	const row = db
		.select({ adoptedAt: definitionVersion.adoptedAt })
		.from(definitionVersion)
		.where(eq(definitionVersion.id, versionId))
		.get();
	return row?.adoptedAt?.getTime() ?? null;
}
