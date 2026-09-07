import type { Audience } from '../../src/lib/server/auth/audience.js';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { decision } from '../../src/lib/server/db/schema/decisions.js';
import { document } from '../../src/lib/server/db/schema/documents.js';
import { definition } from '../../src/lib/server/db/schema/definitions.js';
import {
	getDecision,
	listDecisions,
	searchDecisions
} from '../../src/lib/server/services/decisions.js';
import { definitionsBySection, getDefinition } from '../../src/lib/server/services/definitions.js';
import { getDocument, listDocuments } from '../../src/lib/server/services/documents.js';
import {
	communityArtifact,
	definitionVersion
} from '../../src/lib/server/db/schema/definitions.js';
import { getStandard } from '../../src/lib/server/standard/index.js';

const view = getStandard('rcos-core', '0.1');
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { listLocalDefinitions } from '../../src/lib/server/services/definitions.js';
import { listPassages } from '../../src/lib/server/services/documents.js';
import { glossary } from '../../src/lib/server/services/glossary.js';
import { lookup } from '../../src/lib/server/services/lookup.js';
import { indexDecision } from '../../src/lib/server/services/search.js';
import { getSearchIndex } from '../../src/lib/server/search/index.js';
import { visibleLevels } from '../../src/lib/server/auth/visible-to.js';
import { communityOf } from '../../src/lib/server/auth/audience.js';

/** Which artifact the `definitions.local` entry seeded, per community. */
const LOCAL_ARTIFACT = new Map<string, string>();

/** Two rows of one kind, one member-visible and one published. */
function pair(
	db: Db,
	ctx: Ctx,
	insert: (id: string, visibility: 'member' | 'world', n: number) => void
) {
	const member = newId();
	const world = newId();
	insert(member, 'member', 1);
	insert(world, 'world', 2);
	return { member, world };
}

/**
 * The read services that return rows a community owns.
 *
 * Kept beside the factories rather than in the suite, so the list is a thing
 * somebody adds to when they add a service — the same reason
 * `services/registry.ts` is not a comment in the cross-tenant test.
 *
 * Each entry seeds one `member`-visible row and one `world`-visible row and
 * knows how to read them for a given audience. Until a service takes an
 * `Audience`, `read` throws — which is what makes the suite red for a true
 * reason rather than a placeholder one, and what makes converting a service the
 * thing that turns it green.
 */
export type ReadPath = {
	name: string;
	/**
	 * Set while a service cannot yet answer an anonymous audience. The suite runs
	 * such an entry under `it.fails`, so it asserts something true rather than
	 * being skipped — and the marker clears itself: converting the service makes
	 * the test pass, which makes `it.fails` go red, which forces whoever
	 * converted it to delete the line.
	 *
	 * Nothing is pending today. The field stays because the next phase to add a
	 * read path needs it, and because a registry entry added without one fails
	 * immediately rather than being quietly incomplete.
	 */
	pending?: string;
	/** Two rows, one of each visibility. Returns their ids. */
	seed: (db: Db, ctx: Ctx) => { member: string; world: string };
	read: (audience: Audience, db: Db, seeded: { member: string; world: string }) => { id: string }[];
};

/** A standard definition of each visibility, answering two different sections. */
function seedDefinitions(db: Db, ctx: Ctx, scope: 'standard') {
	const standardId = db.select({ id: communityStandard.id }).from(communityStandard).get()!.id;
	const sections = ['purpose-charter.primary-purpose', 'purpose-charter.secondary-purposes'];
	return pair(db, ctx, (id, visibility, n) =>
		db
			.insert(definition)
			.values({
				id,
				communityId: ctx.community.id,
				scope,
				communityStandardId: standardId,
				sectionKey: sections[n - 1]!,
				provisional: false,
				visibility,
				createdBy: ctx.user.id,
				createdAt: new Date(0),
				updatedAt: new Date(0)
			})
			.run()
	);
}

function seedDocuments(db: Db, ctx: Ctx) {
	return pair(db, ctx, (id, visibility, n) =>
		db
			.insert(document)
			.values({
				id,
				communityId: ctx.community.id,
				filename: `bylaws-${n}.pdf`,
				mime: 'application/pdf',
				bytes: 10,
				sha256: String(n).repeat(64).slice(0, 64),
				storageKey: `k${n}`,
				status: 'extracted',
				statusDetail: null,
				pagesExtracted: 1,
				pagesTotal: 1,
				visibility,
				firstPublishedAt: null,
				uploadedBy: ctx.user.id,
				uploadedAt: new Date(0),
				extractedAt: new Date(0)
			})
			.run()
	);
}

function seedDecisions(db: Db, ctx: Ctx) {
	return pair(db, ctx, (id, visibility, n) =>
		db
			.insert(decision)
			.values({
				id,
				communityId: ctx.community.id,
				seq: n,
				ref: `DEC-2026-00${n}`,
				title: 'Spending authority',
				type: 'strategic',
				layer: null,
				mechanism: 'consent',
				threshold: null,
				tallyPresent: null,
				tallyFor: null,
				tallyAgainst: null,
				unresolvedObjections: 0,
				rationale: null,
				proposalText: 'Any spend over €500 needs a consent decision.',
				decidedAt: new Date(0),
				reviewDueAt: null,
				source: 'online',
				provisional: false,
				status: 'active',
				supersededById: null,
				idempotencyKey: `key-${n}`,
				visibility,
				firstPublishedAt: null,
				recordedBy: ctx.user.id,
				proposalPostId: null
			})
			.run()
	);
}

export const READ_PATHS: ReadPath[] = [
	{
		name: 'definitions.bySection',
		seed: (db, ctx) => seedDefinitions(db, ctx, 'standard'),
		read: (audience, db) => [...definitionsBySection(audience, { db }).values()]
	},
	{
		name: 'definitions.get',
		seed: (db, ctx) => seedDefinitions(db, ctx, 'standard'),
		read: (audience, db, seeded) =>
			[seeded.member, seeded.world].flatMap((id) => {
				try {
					return [getDefinition(audience, id, { db })];
				} catch {
					// A 404 is the right answer for something this reader may not see,
					// so an absence here is a pass rather than an error.
					return [];
				}
			})
	},
	{
		name: 'decisions.list',
		seed: seedDecisions,
		read: (audience, db) => listDecisions(audience, { db })
	},
	{
		name: 'decisions.get',
		seed: seedDecisions,
		read: (audience, db, seeded) =>
			[seeded.member, seeded.world].flatMap((id) => {
				try {
					return [getDecision(audience, id, { db })];
				} catch {
					return [];
				}
			})
	},
	{
		name: 'documents.list',
		seed: seedDocuments,
		read: (audience, db) => listDocuments(audience, { db })
	},
	{
		name: 'documents.get',
		seed: seedDocuments,
		read: (audience, db, seeded) =>
			[seeded.member, seeded.world].flatMap((id) => {
				try {
					return [getDocument(audience, id, { db })];
				} catch {
					return [];
				}
			})
	},
	{
		name: 'definitions.local',
		seed: (db, ctx) => {
			const artifactId = newId();
			db.insert(communityArtifact)
				.values({
					id: artifactId,
					communityId: ctx.community.id,
					title: 'Community Agreements',
					description: null,
					layer: null,
					order: 0,
					kind: 'default',
					visibility: 'world',
					firstPublishedAt: null,
					createdAt: new Date(0)
				})
				.run();
			LOCAL_ARTIFACT.set(ctx.community.id, artifactId);
			return pair(db, ctx, (id, visibility) =>
				db
					.insert(definition)
					.values({
						id,
						communityId: ctx.community.id,
						scope: 'local',
						attachKind: 'community_artifact',
						attachCommunityArtifactId: artifactId,
						provisional: false,
						visibility,
						createdBy: ctx.user.id,
						createdAt: new Date(0),
						updatedAt: new Date(0)
					})
					.run()
			);
		},
		read: (audience, db) =>
			listLocalDefinitions(audience, LOCAL_ARTIFACT.get(communityOf(audience))!, { db })
	},
	{
		name: 'documents.passages',
		seed: seedDocuments,
		read: (audience, db, seeded) =>
			[seeded.member, seeded.world].flatMap((id) => {
				try {
					// The passage list is authorised by its document, so a document the
					// reader cannot see yields nothing rather than its contents.
					listPassages(audience, id, { db });
					return [{ id }];
				} catch {
					return [];
				}
			})
	},
	{
		name: 'glossary',
		/**
		 * Two terms the standard says a community answers, each with an *adopted*
		 * definition — the glossary shows adopted text and nothing else, so a
		 * lighter seed would produce two empty columns and a test that passes
		 * whatever the filter does.
		 */
		seed: (db, ctx) => {
			const mapped = view.glossary.filter((term) => term.definedBy).slice(0, 2);
			const standardId = db.select({ id: communityStandard.id }).from(communityStandard).get()!.id;
			return pair(db, ctx, (id, visibility, n) => {
				const versionId = newId();
				db.insert(definition)
					.values({
						id,
						communityId: ctx.community.id,
						scope: 'standard',
						communityStandardId: standardId,
						sectionKey: mapped[n - 1]!.definedBy!,
						adoptedVersionId: versionId,
						provisional: false,
						visibility,
						createdBy: ctx.user.id,
						createdAt: new Date(0),
						updatedAt: new Date(0)
					})
					.run();
				db.insert(definitionVersion)
					.values({
						id: versionId,
						definitionId: id,
						n: 1,
						body: `What we decided about ${mapped[n - 1]!.key}.`,
						plainLanguage: null,
						type: null,
						authorId: ctx.user.id,
						aiAssisted: false,
						aiTask: null,
						linterResult: null,
						createdAt: new Date(0),
						adoptedAt: new Date(0),
						decisionId: null,
						supersedesVersionId: null
					})
					.run();
			});
		},
		read: (audience, db) =>
			glossary(audience, { db })
				.filter((entry) => entry.ours)
				.map((entry) => ({ id: entry.ours!.definitionId }))
	},
	{
		name: 'decisions.search',
		seed: (db, ctx) => {
			const seeded = seedDecisions(db, ctx);
			indexDecision(db, ctx.community.id, seeded.member);
			indexDecision(db, ctx.community.id, seeded.world);
			return seeded;
		},
		read: (audience, db) => searchDecisions(audience, 'spending', { db })
	},
	{
		name: 'search.query',
		seed: (db, ctx) => {
			const seeded = seedDecisions(db, ctx);
			indexDecision(db, ctx.community.id, seeded.member);
			indexDecision(db, ctx.community.id, seeded.world);
			return seeded;
		},
		read: (audience, db) =>
			getSearchIndex(db)
				.query(communityOf(audience), 'spending consent', { levels: visibleLevels(audience) })
				.map((hit) => ({ id: hit.subjectId }))
	},
	{
		name: 'lookup',
		seed: (db, ctx) => {
			const seeded = seedDecisions(db, ctx);
			indexDecision(db, ctx.community.id, seeded.member);
			indexDecision(db, ctx.community.id, seeded.world);
			return seeded;
		},
		read: (audience, db) =>
			lookup(audience, 'spending consent', { db }).ours.map((hit) => ({ id: hit.subjectId }))
	}
];
