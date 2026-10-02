import { and, eq, inArray } from 'drizzle-orm';
import { ctxCan, type Ctx } from '../auth/guard.js';
import { requireRead, visibleTo } from '../auth/visible-to.js';
import { getDb, type Db } from '../db/index.js';
import { user } from '../db/schema/auth.js';
import { decision } from '../db/schema/decisions.js';
import {
	communityArtifact,
	definition,
	definitionDraft,
	definitionVersion
} from '../db/schema/definitions.js';
import {
	consentEligible,
	consentResponse,
	consentRound,
	discussion,
	proposalMoveRequest
} from '../db/schema/discussions.js';
import { membership } from '../db/schema/tenancy.js';
import {
	definitionStatus,
	type DefinitionStatus,
	type DerivedStatus
} from '../../shared/definition-status.js';
import { activeStandardView, sectionOf } from './completeness.js';
import { ERASED_WITHOUT_COMMUNITY, personLabel } from './person.js';
import { statusesBySection } from './provenance.js';
import { compareRefs } from './requirement.js';

/**
 * Every definition a community has, in one list. `openspec/changes/provenance-ui`
 * D12, D14, the `definitions` spec.
 *
 * Both kinds — answering the standard and the community's own — because a
 * member looking for "the rule about guests" does not know or care which kind
 * it is. Status comes from the same derivation the Standard browser and the
 * definition page use (`statusesBySection` for a standard definition), so one
 * definition reads the same on all three.
 *
 * A fixed number of queries whatever the size of the community: the
 * definitions, their drafts and adopted versions, the open discussions and
 * rounds, the reader's own eligibility, and the open move requests. Never one
 * per row.
 */

export type IndexFilters = {
	status?: DefinitionStatus | null;
	/** An RCOS artifact key, or `local:<community artifact id>`. */
	artifact?: string | null;
	attention?: boolean;
	provisional?: boolean;
};

export type IndexRow = {
	id: string;
	scope: 'standard' | 'local';
	title: string;
	/** The artifact it belongs to, as the filter names it. */
	artifact: { key: string; title: string } | null;
	/** The section's clause references; none for a local definition. */
	refs: string[];
	/** The adopted version's number, or null while nothing is adopted. */
	version: number | null;
	status: DefinitionStatus;
	rediscussed: boolean;
	provisional: boolean;
	lastChangedAt: number;
	lastChangedBy: string | null;
	/** Something here is waiting on the reader (D12). */
	attention: boolean;
};

export function listDefinitions(
	ctx: Ctx,
	filters: IndexFilters = {},
	options: { db?: Db } = {}
): IndexRow[] {
	const audience = requireRead(ctx);
	const db = options.db ?? getDb();
	const now = ctx.now();
	const standard = activeStandardView(db, ctx);
	const locale = ctx.community.locale;

	// 1. Every definition the reader may see — a restricted one only by its audience.
	const rows = db
		.select()
		.from(definition)
		.where(
			and(eq(definition.communityId, ctx.community.id), visibleTo(audience, definition.visibility))
		)
		.all()
		.filter((row) => row.scope === 'local' || row.communityStandardId === standard?.row.id);
	if (rows.length === 0) return [];
	const ids = rows.map((row) => row.id);

	// 2. Drafts and adopted versions, for "last changed and by whom" and the version.
	const drafts = new Map(
		db
			.select()
			.from(definitionDraft)
			.where(inArray(definitionDraft.definitionId, ids))
			.all()
			.map((row) => [row.definitionId, row])
	);
	const adoptedIds = rows.map((row) => row.adoptedVersionId).filter((id): id is string => !!id);
	const versions = new Map(
		adoptedIds.length === 0
			? []
			: db
					.select({ version: definitionVersion, recordedBy: decision.recordedBy })
					.from(definitionVersion)
					.leftJoin(decision, eq(decision.id, definitionVersion.decisionId))
					.where(inArray(definitionVersion.id, adoptedIds))
					.all()
					.map((row) => [row.version.id, row])
	);

	// 3. Community artifacts, for a local definition's artifact title.
	const ownArtifacts = new Map(
		db
			.select()
			.from(communityArtifact)
			.where(eq(communityArtifact.communityId, ctx.community.id))
			.all()
			.map((row) => [row.id, row])
	);

	// 4. Open discussions and the rounds open on them, mapped to a definition.
	const byId = new Map(rows.map((row) => [row.id, row]));
	const bySection = new Map(
		rows.filter((row) => row.sectionKey).map((row) => [row.sectionKey!, row])
	);
	const open = db
		.select()
		.from(discussion)
		.where(and(eq(discussion.communityId, ctx.community.id), eq(discussion.status, 'open')))
		.all();
	const threadsOf = new Map<string, (typeof open)[number][]>();
	for (const thread of open) {
		const owner = thread.definitionId
			? byId.get(thread.definitionId)
			: standard
				? bySection.get(sectionOf(standard.view, thread) ?? '')
				: undefined;
		if (!owner) continue;
		threadsOf.set(owner.id, [...(threadsOf.get(owner.id) ?? []), thread]);
	}
	const currentProposals = open
		.map((thread) => thread.currentProposalPostId)
		.filter((id): id is string => !!id);
	const openRounds = new Map(
		currentProposals.length === 0
			? []
			: db
					.select()
					.from(consentRound)
					.where(
						and(
							inArray(consentRound.proposalPostId, currentProposals),
							eq(consentRound.status, 'open')
						)
					)
					.all()
					.map((row) => [row.proposalPostId, row])
	);

	// 5. The reader's part in those rounds: eligible, and whether they answered.
	const roundIds = [...openRounds.values()].map((round) => round.id);
	const eligibleIn = new Set(
		roundIds.length === 0
			? []
			: db
					.select({ roundId: consentEligible.roundId })
					.from(consentEligible)
					.where(
						and(
							inArray(consentEligible.roundId, roundIds),
							eq(consentEligible.membershipId, ctx.membership.id)
						)
					)
					.all()
					.map((row) => row.roundId)
	);
	const answeredIn = new Set(
		roundIds.length === 0
			? []
			: db
					.select({ roundId: consentResponse.roundId })
					.from(consentResponse)
					.where(
						and(
							inArray(consentResponse.roundId, roundIds),
							eq(consentResponse.membershipId, ctx.membership.id)
						)
					)
					.all()
					.map((row) => row.roundId)
	);

	// 6. Open move requests, which wait on whoever may move the question.
	const canMove = ctxCan(ctx, 'proposal.set_current');
	const requested = new Set(
		canMove
			? db
					.select({ discussionId: proposalMoveRequest.discussionId })
					.from(proposalMoveRequest)
					.where(
						and(
							eq(proposalMoveRequest.communityId, ctx.community.id),
							eq(proposalMoveRequest.state, 'open')
						)
					)
					.all()
					.map((row) => row.discussionId)
			: []
	);

	// 7. Names, through `personLabel` like every surface (docs/03 §10).
	const people = [
		...new Set(
			rows.flatMap((row) => {
				const draft = drafts.get(row.id);
				const adopted = row.adoptedVersionId ? versions.get(row.adoptedVersionId) : undefined;
				return [draft?.updatedBy, adopted?.recordedBy, row.createdBy];
			})
		)
	].filter((id): id is string => !!id);
	const labels = new Map(
		people.length === 0
			? []
			: db
					.select({
						id: user.id,
						name: user.name,
						erasedAt: user.erasedAt,
						displayName: membership.displayName,
						seq: membership.seq
					})
					.from(user)
					.leftJoin(
						membership,
						and(eq(membership.userId, user.id), eq(membership.communityId, ctx.community.id))
					)
					.where(inArray(user.id, people))
					.all()
					.map((row) => [row.id, personLabel(row)])
	);
	const label = (id: string | null | undefined) =>
		id ? (labels.get(id) ?? ERASED_WITHOUT_COMMUNITY) : null;

	// The standard browser's derivation, so a standard definition reads the same there.
	const sectionStatuses = statusesBySection(ctx, { db });

	const out = rows.map((row): IndexRow => {
		const threads = threadsOf.get(row.id) ?? [];
		const derived: DerivedStatus =
			row.scope === 'standard' && row.sectionKey && sectionStatuses.has(row.sectionKey)
				? sectionStatuses.get(row.sectionKey)!
				: definitionStatus(
						{
							exists: true,
							adopted: row.adoptedVersionId !== null,
							openDiscussion: threads.length > 0,
							openRound: threads.some(
								(thread) =>
									thread.currentProposalPostId !== null &&
									openRounds.has(thread.currentProposalPostId)
							),
							reviewDueAt: row.reviewDueAt?.getTime() ?? null
						},
						now
					);

		const section = row.sectionKey ? standard?.view.section(row.sectionKey) : undefined;
		const artifact = (() => {
			if (section) {
				const found = standard!.view.artifact(section.artifact);
				return found
					? {
							key: found.key,
							title: standard!.view.localise(found.i18n, locale).value.title ?? found.key
						}
					: null;
			}
			if (row.attachRcosArtifactKey && standard) {
				const found = standard.view.artifact(row.attachRcosArtifactKey);
				return found
					? {
							key: found.key,
							title: standard.view.localise(found.i18n, locale).value.title ?? found.key
						}
					: null;
			}
			const own = row.attachCommunityArtifactId
				? ownArtifacts.get(row.attachCommunityArtifactId)
				: undefined;
			return own ? { key: `local:${own.id}`, title: own.title } : null;
		})();

		const draft = drafts.get(row.id);
		const adopted = row.adoptedVersionId ? versions.get(row.adoptedVersionId) : undefined;
		const adoptedAt = adopted?.version.adoptedAt?.getTime() ?? 0;
		const draftAt = draft?.updatedAt.getTime() ?? 0;
		const [lastChangedAt, lastChangedBy] =
			adoptedAt >= draftAt
				? [adoptedAt || row.createdAt.getTime(), adopted ? adopted.recordedBy : row.createdBy]
				: [draftAt, draft?.updatedBy ?? null];

		const waitingOnMe = threads.some((thread) => {
			const round = thread.currentProposalPostId
				? openRounds.get(thread.currentProposalPostId)
				: undefined;
			return (
				(round !== undefined && eligibleIn.has(round.id) && !answeredIn.has(round.id)) ||
				requested.has(thread.id)
			);
		});

		return {
			id: row.id,
			scope: row.scope,
			title:
				row.scope === 'local'
					? (row.title ?? '')
					: section
						? standard!.view.localise(section.i18n, locale).value.title
						: (row.sectionKey ?? ''),
			artifact,
			refs: section ? [...section.ownsClauses].sort(compareRefs) : [],
			version: adopted?.version.n ?? null,
			status: derived.status,
			rediscussed: derived.rediscussed,
			provisional: row.provisional,
			lastChangedAt,
			lastChangedBy: label(lastChangedBy),
			attention: waitingOnMe || (derived.status === 'needs_review' && row.createdBy === ctx.user.id)
		};
	});

	return filterRows(out, filters).sort((a, b) => b.lastChangedAt - a.lastChangedAt);
}

function filterRows(rows: IndexRow[], filters: IndexFilters): IndexRow[] {
	return rows
		.filter((row) => !filters.status || row.status === filters.status)
		.filter((row) => !filters.artifact || row.artifact?.key === filters.artifact)
		.filter((row) => !filters.attention || row.attention)
		.filter((row) => !filters.provisional || row.provisional);
}

/**
 * The index page's data: the filtered rows, how many there are in all, and the
 * artifacts something here belongs to — a filter option that can only empty the
 * list is noise. One read of the definitions, filtered here.
 */
export function definitionsIndex(
	ctx: Ctx,
	filters: IndexFilters,
	options: { db?: Db } = {}
): { rows: IndexRow[]; total: number; artifacts: { key: string; title: string }[] } {
	const all = listDefinitions(ctx, {}, options);
	return {
		rows: filterRows(all, filters),
		total: all.length,
		artifacts: [
			...new Map(
				all.filter((row) => row.artifact).map((row) => [row.artifact!.key, row.artifact!])
			).values()
		].sort((a, b) => a.title.localeCompare(b.title))
	};
}
