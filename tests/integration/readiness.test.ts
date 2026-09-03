import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import {
	clauseCoverage,
	communityArtifact,
	definition
} from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { artifactProgress } from '../../src/lib/server/services/completeness.js';
import { createDefinition } from '../../src/lib/server/services/definitions.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import { allReadiness, compliance, readiness } from '../../src/lib/server/services/readiness.js';
import { clearStandardViews, getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The arithmetic. docs/03-data-model.md §7.
 *
 * Two numbers with two audiences: readiness is inward and a percentage,
 * compliance is outward and a yes or no. The tests that matter most are the ones
 * about what does *not* count — a local definition, a clause nobody can answer,
 * a module's progress — because those are the ways a number becomes a lie.
 */
const NOW = Date.UTC(2026, 8, 3, 12, 0, 0);
const core = getStandard('rcos-core', '0.1');

let db: Db;
let cleanup: () => void;
let ctx: Ctx;
let standardRowId: string;
let artifactId: string;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);

	const community = makeCommunity(db, { slug: 'valle-verde' });
	standardRowId = newId();
	db.insert(communityStandard)
		.values({
			id: standardRowId,
			communityId: community.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();

	artifactId = newId();
	db.insert(communityArtifact)
		.values({
			id: artifactId,
			communityId: community.id,
			title: 'Community Agreements',
			description: null,
			layer: null,
			order: 0,
			kind: 'default',
			createdAt: new Date(NOW)
		})
		.run();

	const person = makeUser(db, { email: 'ana@example.org' });
	const seat = makeMembership(db, community.id, person.id, { role: 'steward', isOwner: true });
	ctx = { user: person, community, membership: seat, now: () => NOW };
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

let keys = 0;
/** Answer one countable clause the way the application does: by freezing. */
function answer(clauseKey: string, at: number = NOW) {
	const who: Ctx = { ...ctx, now: () => at };
	const opened = openDiscussion(
		who,
		{ title: 'A gap', about: { kind: 'clause', clauseKey } },
		{ db }
	);
	addProposal(who, { discussionId: opened.id, body: 'What we decided.' }, { db });
	return freeze(
		who,
		{
			discussionId: opened.id,
			idempotencyKey: `k-${(keys += 1)}`,
			title: 'A decision',
			type: 'strategic',
			mechanism: 'consent'
		},
		{ db }
	);
}

/** A fresh Ctx, so the per-request memo does not answer a later question. */
const fresh = (at: number = NOW): Ctx => ({ ...ctx, now: () => at });

describe('readiness counts answerable MUST clauses and nothing else', () => {
	it('starts at zero with the whole countable set as the denominator', () => {
		const now = readiness(fresh(), { db })!;
		expect(now.satisfied).toBe(0);
		expect(now.percent).toBe(0);
		expect(now.countable).toBe(core.countableClauses().length);
	});

	it('rises by exactly the clauses the answered section owns', () => {
		const clause = core.countableClauses()[0]!;
		const owned = core.countableClauses().filter((c) => c.owner === clause.owner).length;

		answer(clause.key);

		expect(readiness(fresh(), { db })!.satisfied).toBe(owned);
	});

	it('excludes clauses no community can answer, from both parts of the fraction', () => {
		const uncountable = core.clauses.filter((c) => c.disposition !== 'defined_by_section');
		expect(uncountable.length).toBeGreaterThan(0);

		const now = readiness(fresh(), { db })!;
		// The denominator is the countable set, which is what makes 100% reachable
		// at all: 12 MUST clauses in core 0.1 are answered by the platform or are
		// not definitions.
		expect(now.countable).toBe(
			core.clauses.filter((c) => c.normativity === 'MUST' && c.disposition === 'defined_by_section')
				.length
		);
		expect(now.countable).toBeLessThan(core.clauses.filter((c) => c.normativity === 'MUST').length);
	});

	it('reaches 100% when every countable clause is answered', () => {
		const sections = new Set(core.countableClauses().map((c) => c.owner!));
		for (const sectionKey of sections) {
			const clause = core.countableClauses().find((c) => c.owner === sectionKey)!;
			answer(clause.key);
		}

		const done = readiness(fresh(), { db })!;
		expect(done.satisfied).toBe(done.countable);
		expect(done.percent).toBe(100);
	});

	it('still counts a definition past its review date, and says it is stale', () => {
		const clause = core.countableClauses()[0]!;
		answer(clause.key);

		// The rule exists; it is merely overdue for a look.
		db.update(definition)
			.set({ reviewDueAt: new Date(NOW - 1000) })
			.run();

		const now = readiness(fresh(), { db })!;
		expect(now.satisfied).toBeGreaterThan(0);
		expect(now.stale).toBeGreaterThan(0);
	});

	it('reports each layer, and reports "nothing to answer" rather than 0%', () => {
		const now = readiness(fresh(), { db })!;
		expect(now.layers.length).toBe(core.meta.layers.length);

		for (const layer of now.layers) {
			if (layer.countable === 0) expect(layer.percent).toBeNull();
			else expect(layer.percent).toBe(0);
		}
	});

	it('moves one layer without moving the others', () => {
		const clause = core.countableClauses()[0]!;
		answer(clause.key);

		const now = readiness(fresh(), { db })!;
		const moved = now.layers.filter((l) => l.satisfied > 0);
		expect(moved).toHaveLength(1);
		expect(moved[0]!.layer).toBe(clause.layer);
	});
});

describe('a local definition moves nothing', () => {
	it('leaves readiness where it was', () => {
		const before = readiness(fresh(), { db })!;

		createDefinition(
			ctx,
			{ scope: 'local', title: 'Quiet hours', attach: { kind: 'community_artifact', artifactId } },
			{ db }
		);

		const after = readiness(fresh(), { db })!;
		expect(after.satisfied).toBe(before.satisfied);
		expect(after.countable).toBe(before.countable);
	});

	it('is filtered out even if coverage somehow named one', () => {
		// Coverage should never hold a local definition. The filter says so rather
		// than assuming it, because the cost of being wrong is a false number.
		const local = createDefinition(
			ctx,
			{ scope: 'local', title: 'Quiet hours', attach: { kind: 'community_artifact', artifactId } },
			{ db }
		);
		db.insert(clauseCoverage)
			.values({
				communityId: ctx.community.id,
				communityStandardId: standardRowId,
				clauseKey: core.countableClauses()[0]!.key,
				definitionId: local.id
			})
			.run();

		expect(readiness(fresh(), { db })!.satisfied).toBe(0);
	});
});

describe('artifact completeness counts only authored sections', () => {
	it('ignores the Ratification Record the platform fills', () => {
		const artifact = core.artifacts.find(
			(a) => a.mandatory && core.sectionsFilledFromDecision(a.key).length > 0
		)!;

		const progress = artifactProgress(ctx, artifact.key, { db });
		// The artifact has more sections than it has questions.
		expect(progress.authored).toBeLessThan(core.sectionsOf(artifact.key).length);
		expect(progress.missing.every((key) => !key.endsWith('ratification-record'))).toBe(true);
	});

	it('completes when every authored section is answered, and names what is missing', () => {
		const artifact = core.mandatoryArtifacts()[0]!;
		const authored = core.authoredSectionsOf(artifact.key);

		for (const section of authored.slice(0, -1)) {
			const clause = core.countableClauses().find((c) => c.owner === section.key);
			if (clause) answer(clause.key);
			else db.insert(definition).values(standardDefinitionRow(section.key)).run();
		}

		const partway = artifactProgress(ctx, artifact.key, { db });
		expect(partway.complete).toBe(false);
		expect(partway.missing).toContain(authored.at(-1)!.key);
	});

	it('stays complete when local definitions are attached to it', () => {
		const artifact = core.mandatoryArtifacts()[0]!;
		for (const section of core.authoredSectionsOf(artifact.key)) {
			db.insert(definition).values(standardDefinitionRow(section.key)).run();
		}
		expect(artifactProgress(ctx, artifact.key, { db }).complete).toBe(true);

		createDefinition(
			ctx,
			{
				scope: 'local',
				title: 'More about this',
				attach: { kind: 'rcos_artifact', artifactKey: artifact.key }
			},
			{ db }
		);
		expect(artifactProgress(ctx, artifact.key, { db }).complete).toBe(true);
	});
});

/** An adopted standard definition, without going the long way round a freeze. */
function standardDefinitionRow(sectionKey: string) {
	const versionId = newId();
	const id = newId();
	db.insert(definition)
		.values({
			id,
			communityId: ctx.community.id,
			scope: 'standard',
			communityStandardId: standardRowId,
			sectionKey,
			title: null,
			layer: null,
			purpose: null,
			attachKind: null,
			attachRcosArtifactKey: null,
			attachCommunityArtifactId: null,
			adoptedVersionId: versionId,
			openProposalId: null,
			reviewDueAt: null,
			provisional: false,
			createdBy: ctx.user.id,
			createdAt: new Date(NOW),
			updatedAt: new Date(NOW)
		})
		.run();
	db.delete(definition).where(eq(definition.id, id)).run();
	return {
		id,
		communityId: ctx.community.id,
		scope: 'standard' as const,
		communityStandardId: standardRowId,
		sectionKey,
		title: null,
		layer: null,
		purpose: null,
		attachKind: null,
		attachRcosArtifactKey: null,
		attachCommunityArtifactId: null,
		adoptedVersionId: versionId,
		openProposalId: null,
		reviewDueAt: null,
		provisional: false,
		createdBy: ctx.user.id,
		createdAt: new Date(NOW),
		updatedAt: new Date(NOW)
	};
}

describe('the outward claim is binary', () => {
	it('is false while mandatory artifacts are unfinished, and names them', () => {
		const claim = compliance(ctx, { db })!;
		expect(claim.compliant).toBe(false);
		expect(claim.incompleteArtifacts.length).toBe(core.mandatoryArtifacts().length);
		// No percentage anywhere near it.
		expect(Object.keys(claim)).not.toContain('percent');
	});

	it('is false while anything answering a MUST is provisional', () => {
		// Every mandatory artifact answered, but before the community had a
		// Decision Matrix — so every one of those decisions was taken under a rule
		// it had not agreed.
		for (const artifact of core.mandatoryArtifacts()) {
			for (const section of core.authoredSectionsOf(artifact.key)) {
				db.insert(definition)
					.values({ ...standardDefinitionRow(section.key), provisional: true })
					.run();
			}
		}

		const claim = compliance(ctx, { db })!;
		expect(claim.incompleteArtifacts).toHaveLength(0);
		expect(claim.provisionalDefinitions).toBeGreaterThan(0);
		expect(claim.compliant).toBe(false);
	});

	it('is true only when both hold', () => {
		for (const artifact of core.mandatoryArtifacts()) {
			for (const section of core.authoredSectionsOf(artifact.key)) {
				db.insert(definition).values(standardDefinitionRow(section.key)).run();
			}
		}

		expect(compliance(ctx, { db })!.compliant).toBe(true);
	});
});

describe('a module is never summed into core', () => {
	/**
	 * The fake module is vendored into the real standard root and removed
	 * afterwards, because that is where a module will actually live — pointing
	 * the loader at a temporary directory would test a path the product never
	 * takes. `check-standard.mjs` reads the manifest, so an extra directory it
	 * does not list is ignored.
	 */
	const root = join(import.meta.dirname, '../../standard');
	const moduleDir = join(root, 'rcos-module-fake');

	function vendorFakeModule() {
		cpSync(join(root, 'rcos-core'), moduleDir, { recursive: true });
		const metaFile = join(moduleDir, '0.1', 'meta.yaml');
		writeFileSync(
			metaFile,
			readFileSync(metaFile, 'utf8').replace('standard: rcos-core', 'standard: rcos-module-fake')
		);
		clearStandardViews();
	}

	function insertAdopted(communityStandardId: string, sectionKey: string): string {
		const id = newId();
		db.insert(definition)
			.values({
				id,
				communityId: ctx.community.id,
				scope: 'standard',
				communityStandardId,
				sectionKey,
				title: null,
				layer: null,
				purpose: null,
				attachKind: null,
				attachRcosArtifactKey: null,
				attachCommunityArtifactId: null,
				adoptedVersionId: newId(),
				openProposalId: null,
				reviewDueAt: null,
				provisional: false,
				createdBy: ctx.user.id,
				createdAt: new Date(NOW),
				updatedAt: new Date(NOW)
			})
			.run();
		return id;
	}

	it('keeps each adopted standard on its own figure', () => {
		vendorFakeModule();
		try {
			const moduleRow = newId();
			db.insert(communityStandard)
				.values({
					id: moduleRow,
					communityId: ctx.community.id,
					standardId: 'rcos-module-fake',
					version: '0.1',
					status: 'active',
					adoptedAt: new Date(NOW),
					retiredAt: null
				})
				.run();

			// The module is finished; core is untouched.
			const moduleView = getStandard('rcos-module-fake', '0.1');
			const bySection = new Map<string, string>();
			for (const clause of moduleView.countableClauses()) {
				const definitionId =
					bySection.get(clause.owner!) ?? insertAdopted(moduleRow, clause.owner!);
				bySection.set(clause.owner!, definitionId);
				db.insert(clauseCoverage)
					.values({
						communityId: ctx.community.id,
						communityStandardId: moduleRow,
						clauseKey: clause.key,
						definitionId
					})
					.run();
			}

			const figures = allReadiness(fresh(), { db });
			const forCore = figures.find((f) => f.standardId === 'rcos-core')!;
			const forModule = figures.find((f) => f.standardId === 'rcos-module-fake')!;

			expect(forModule.percent).toBe(100);
			expect(forCore.percent).toBe(0);
			// A list, never a total: there is no place a caller could add them.
			expect(figures).toHaveLength(2);

			// RCOS §10.1.5: the outward claim is about core, whatever a module says.
			const claim = compliance(ctx, { db })!;
			expect(claim.standardId).toBe('rcos-core');
			expect(claim.compliant).toBe(false);
		} finally {
			rmSync(moduleDir, { recursive: true, force: true });
			clearStandardViews();
		}
	});
});

describe('the numbers are computed, never stored', () => {
	it('reflects a freeze immediately, with no recomputation step', () => {
		expect(readiness(fresh(), { db })!.satisfied).toBe(0);
		answer(core.countableClauses()[0]!.key);
		expect(readiness(fresh(), { db })!.satisfied).toBeGreaterThan(0);
	});

	it('is unchanged by anything that is not a definition', () => {
		const before = readiness(fresh(), { db })!;
		makeMembership(db, ctx.community.id, makeUser(db, { email: 'new@example.org' }).id, {
			role: 'member'
		});
		expect(readiness(fresh(), { db })).toEqual(before);
	});

	it('answers one request from one computation', () => {
		const request = fresh();
		const first = readiness(request, { db })!;
		answer(core.countableClauses()[0]!.key);

		// Memoised for the life of the request, deliberately: several panels ask
		// the same question and must not disagree with each other mid-page.
		expect(readiness(request, { db })).toBe(first);
		// A new request sees the new answer.
		expect(readiness(fresh(), { db })!.satisfied).toBeGreaterThan(0);
	});
});
