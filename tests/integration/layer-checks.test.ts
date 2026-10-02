import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { transparencyException } from '../../src/lib/server/db/schema/visibility.js';
import { layerChecks, type LayerCheck } from '../../src/lib/server/services/layer-checks.js';
import { compliance } from '../../src/lib/server/services/readiness.js';
import { outwardClaim } from '../../src/lib/server/services/claim.js';
import { runSelfAudit, type AuditSnapshot } from '../../src/lib/server/services/self-audit.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The `layer-checks` capability: each layer's "artifacts MUST be" clause, shown
 * as checks computed from what Compass records.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const DAY = 86_400_000;

let db: Db;
let cleanup: () => void;
let ctx: Ctx;

function seedCommunity(slug: string) {
	const community = makeCommunity(db, { slug });
	const standardId = newId();
	db.insert(communityStandard)
		.values({
			id: standardId,
			communityId: community.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const person = makeUser(db, { email: `steward-${slug}@example.org` });
	const seat = makeMembership(db, community.id, person.id, { role: 'steward', isOwner: true });
	return {
		ctx: { user: person, community, membership: seat, now: () => NOW } as Ctx,
		standardId
	};
}

let standardId: string;

/** An adopted standard definition, the way a freeze leaves one. */
function adopt(
	sectionKey: string,
	options: {
		on?: { ctx: Ctx; standardId: string };
		visibility?: 'member' | 'restricted';
		decision?: boolean;
		provisional?: boolean;
		lint?: { clean: boolean } | null;
		reviewDueAt?: number | null;
	} = {}
) {
	const on = options.on ?? { ctx, standardId };
	const definitionId = newId();
	const versionId = newId();
	db.insert(definition)
		.values({
			id: definitionId,
			communityId: on.ctx.community.id,
			scope: 'standard',
			communityStandardId: on.standardId,
			sectionKey,
			title: null,
			layer: null,
			purpose: null,
			attachKind: null,
			attachRcosArtifactKey: null,
			attachCommunityArtifactId: null,
			adoptedVersionId: versionId,
			openProposalId: null,
			reviewDueAt:
				options.reviewDueAt === null ? null : new Date(options.reviewDueAt ?? NOW + 300 * DAY),
			provisional: options.provisional ?? false,
			visibility: options.visibility ?? 'member',
			createdBy: on.ctx.user.id,
			createdAt: new Date(NOW),
			updatedAt: new Date(NOW)
		})
		.run();
	db.insert(definitionVersion)
		.values({
			id: versionId,
			definitionId,
			n: 1,
			body: 'What we decided.',
			plainLanguage: null,
			type: null,
			authorId: on.ctx.user.id,
			linterResult: options.lint === undefined ? { clean: true, findings: [] } : options.lint,
			createdAt: new Date(NOW),
			adoptedAt: new Date(NOW),
			decisionId: options.decision === false ? null : newId(),
			supersedesVersionId: null
		})
		.run();
	return definitionId;
}

function exception(subjectId: string, expiresAt: number, expiredAt: number | null = null) {
	db.insert(transparencyException)
		.values({
			id: newId(),
			communityId: ctx.community.id,
			subjectType: 'definition',
			subjectId,
			audience: 'stewards',
			justification: 'Names a member in hardship.',
			decisionId: null,
			expiresAt: new Date(expiresAt),
			expiredAt: expiredAt === null ? null : new Date(expiredAt),
			renewsId: null,
			createdBy: ctx.user.id,
			createdAt: new Date(NOW)
		})
		.run();
}

const check = (layer: number, property: LayerCheck['property'], who: Ctx = ctx) =>
	layerChecks({ ...who }, { db })
		.find((entry) => entry.layer === layer)!
		.checks.find((c) => c.property === property);

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	({ ctx, standardId } = seedCommunity('valle-verde'));
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

describe('a community that has adopted nothing', () => {
	it('names the missing artifacts and says nothing else is adopted yet', () => {
		const layer0 = layerChecks(ctx, { db })[0]!;
		expect(layer0.layer).toBe(0);
		const complete = layer0.checks[0]!;
		expect(complete).toMatchObject({ property: 'complete', result: 'not_met' });
		expect(complete.refs).toEqual(['2.5.1', '2.5.3']);
		expect(complete.items.map((item) => item.title)).toEqual(
			expect.arrayContaining(['Purpose Charter', 'Scope Declaration', 'Invariants Register'])
		);
		expect(complete.items).toHaveLength(4);
		for (const c of layer0.checks.slice(1)) expect(c.result).toBe('nothing_adopted');
	});

	it('shows one block per layer', () => {
		expect(layerChecks(ctx, { db }).map((entry) => entry.layer)).toEqual([0, 1, 2, 3, 4, 5, 6]);
	});
});

describe('the properties come from each layer’s clause', () => {
	it('checks what §2.5.2, §4.7.2 and §7.6.2 name, and nothing more', () => {
		const props = (layer: number) =>
			layerChecks(ctx, { db })
				.find((entry) => entry.layer === layer)!
				.checks.map((c) => c.property);
		expect(props(0)).toEqual(['complete', 'accessible', 'versioned', 'ratified']);
		expect(props(2)).toEqual(['complete', 'explicit', 'versioned', 'accessible']);
		expect(props(5)).toEqual(['complete', 'explicit', 'versioned', 'accessible', 'maintained']);
		expect(check(2, 'accessible')!.refs).toEqual(['4.7.2']);
	});
});

describe('accessible to all members', () => {
	it('is not met by a restricted definition where the layer allows no exception', () => {
		const id = adopt('purpose-charter.primary-purpose', { visibility: 'restricted' });
		exception(id, NOW + 30 * DAY);
		const result = check(0, 'accessible')!;
		expect(result.result).toBe('not_met');
		expect(result.items).toEqual([
			expect.objectContaining({ definitionId: id, reason: 'restricted_no_exceptions' })
		]);
	});

	it('is met by a restricted Layer 3 definition under a live exception, listed with its end', () => {
		const id = adopt('treasury-ruleset.transparency-and-reporting', { visibility: 'restricted' });
		exception(id, NOW + 30 * DAY);
		const result = check(3, 'accessible')!;
		expect(result).toMatchObject({ result: 'met', allowsExceptions: true });
		expect(result.items).toEqual([
			expect.objectContaining({ reason: 'restricted_with_exception', at: NOW + 30 * DAY })
		]);
	});

	it('is not met once that exception has expired', () => {
		const id = adopt('treasury-ruleset.transparency-and-reporting', { visibility: 'restricted' });
		exception(id, NOW - DAY, NOW - DAY);
		expect(check(3, 'accessible')!.result).toBe('not_met');
	});
});

describe('adopted through a governance process', () => {
	it('needs attention while a definition is provisional', () => {
		adopt('purpose-charter.primary-purpose', { provisional: true });
		const result = check(0, 'ratified')!;
		expect(result.result).toBe('attention');
		expect(result.items[0]!.reason).toBe('provisional');
	});

	it('is not met by a version with no recorded decision', () => {
		adopt('purpose-charter.primary-purpose', { decision: false });
		expect(check(0, 'ratified')!.result).toBe('not_met');
	});

	it('is met when every version came from a decision', () => {
		adopt('purpose-charter.primary-purpose');
		expect(check(0, 'ratified')!.result).toBe('met');
	});
});

describe('explicit and unambiguous', () => {
	it('is always for a human, and counts what the linter flagged or never read', () => {
		adopt('membership-agreement.member-rights', { lint: { clean: false } });
		adopt('membership-agreement.member-obligations', { lint: null });
		adopt('membership-state-registry.defined-membership-states');
		const result = check(1, 'explicit')!;
		expect(result).toMatchObject({ result: 'human', needsReading: 2 });
		expect(result.items.map((item) => item.reason).sort()).toEqual([
			'linter_findings',
			'never_linted'
		]);
	});
});

describe('kept up to date', () => {
	it('needs attention past a review date, and is not met with none', () => {
		adopt('role-registry.overview', { reviewDueAt: NOW - 3 * DAY });
		expect(check(5, 'maintained')).toMatchObject({ result: 'attention' });
		adopt('role-registry.operational-roles', { reviewDueAt: null });
		expect(check(5, 'maintained')).toMatchObject({ result: 'not_met' });
	});
});

describe('what the checks count', () => {
	it('ignores a local definition, even a restricted one', () => {
		db.insert(definition)
			.values({
				id: newId(),
				communityId: ctx.community.id,
				scope: 'local',
				communityStandardId: null,
				sectionKey: null,
				title: 'Quiet hours',
				layer: 1,
				purpose: null,
				attachKind: 'rcos_artifact',
				attachRcosArtifactKey: 'membership-agreement',
				attachCommunityArtifactId: null,
				adoptedVersionId: null,
				openProposalId: null,
				reviewDueAt: null,
				provisional: false,
				visibility: 'restricted',
				createdBy: ctx.user.id,
				createdAt: new Date(NOW),
				updatedAt: new Date(NOW)
			})
			.run();
		expect(check(1, 'accessible')!.result).toBe('nothing_adopted');
	});

	it('ignores another community', () => {
		const other = seedCommunity('rio-claro');
		adopt('purpose-charter.primary-purpose', { on: other, visibility: 'restricted' });
		expect(check(0, 'accessible')!.result).toBe('nothing_adopted');
		expect(check(0, 'accessible', other.ctx)!.result).toBe('not_met');
	});

	it('refuses someone without read access to the community', () => {
		const observer = { ...ctx, membership: { ...ctx.membership, role: 'observer' as never } };
		expect(catchRefusal(() => layerChecks(observer, { db }))?.status).toBe(403);
	});

	it('leaves compliance alone for what only informs', () => {
		const id = adopt('membership-agreement.member-rights');
		const before = compliance({ ...ctx }, { db });
		db.update(definitionVersion)
			.set({ linterResult: { clean: false } })
			.where(eq(definitionVersion.definitionId, id))
			.run();
		expect(check(1, 'explicit')!.needsReading).toBe(1);
		expect(compliance({ ...ctx }, { db })).toEqual(before);
	});
});

describe('a rule members cannot read, where the standard allows no exception', () => {
	/** Every authored section adopted, from a decision, readable: compliant. */
	function adoptEverything(on = { ctx, standardId }) {
		const ids = new Map<string, string>();
		for (const section of getStandard('rcos-core', '0.1').authoredSections())
			ids.set(section.key, adopt(section.key, { on }));
		return ids;
	}
	const restrict = (id: string) =>
		db.update(definition).set({ visibility: 'restricted' }).where(eq(definition.id, id)).run();

	it('costs compliance in every place compliance is computed', () => {
		const ids = adoptEverything();
		expect(compliance({ ...ctx }, { db })!.compliant).toBe(true);
		expect(outwardClaim(ctx, { db })!.compliant).toBe(true);

		restrict(ids.get('purpose-charter.primary-purpose')!);

		const inward = compliance({ ...ctx }, { db })!;
		expect(inward).toMatchObject({ compliant: false, restrictedDefinitions: 1 });
		const outward = outwardClaim(ctx, { db })!;
		expect(outward).toMatchObject({ compliant: false, restrictedDefinitions: 1, missing: [] });
		// Counted, never named.
		expect(JSON.stringify(outward)).not.toContain('Primary Purpose');
		const audit = runSelfAudit({ ...ctx }, { db });
		expect(audit.compliant).toBe(false);
		expect((audit.snapshot as AuditSnapshot).restricted).toEqual([
			expect.objectContaining({ sectionKey: 'purpose-charter.primary-purpose', layer: 0 })
		]);
	});

	it('does not cost it in Layer 3 under a live transparency exception', () => {
		const ids = adoptEverything();
		const id = ids.get('treasury-ruleset.transparency-and-reporting')!;
		restrict(id);
		exception(id, NOW + 30 * DAY);
		expect(compliance({ ...ctx }, { db })).toMatchObject({
			compliant: true,
			restrictedDefinitions: 0
		});
		expect(runSelfAudit({ ...ctx }, { db }).compliant).toBe(true);
	});

	it('only counts this community', () => {
		adoptEverything();
		const other = seedCommunity('rio-claro');
		const theirs = adopt('purpose-charter.primary-purpose', { on: other });
		restrict(theirs);
		expect(compliance({ ...ctx }, { db })!.compliant).toBe(true);
		expect(compliance({ ...other.ctx }, { db })!.restrictedDefinitions).toBe(1);
	});
});
