import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { anonymousIn, scopedTo } from '../../src/lib/server/auth/audience.js';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { asSignedIn } from '../../src/lib/server/auth/audience.js';
import { outwardClaim } from '../../src/lib/server/services/claim.js';
import { buildBundle } from '../../src/lib/server/services/export.js';
import { mirrorAudience, mirrorFiles } from '../../src/lib/server/services/mirror.js';
import { publishedArtifacts } from '../../src/lib/server/services/public-index.js';
import { publish } from '../../src/lib/server/services/publishing.js';
import { renderArtifact } from '../../src/lib/server/services/render-artifact.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The outward paths, asserted directly. `docs/04-security.md` §2 and §4.
 *
 * The cross-tenant suite walks `services/registry.ts`, and almost nothing this
 * phase added can go in it: a registered service takes a `Ctx` and a subject id,
 * while the public loaders take no `Ctx` at all and the export, the mirror and
 * the claim take a community rather than a subject. So every one of them is
 * named here instead, with both boundaries checked — the tenant one and the
 * visibility one — because these are the four ways content leaves the building.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let bo: Ctx;

function seed(slug: string): { ctx: Ctx; standardRowId: string } {
	const home = makeCommunity(db, { slug });
	const standardRowId = newId();
	db.insert(communityStandard)
		.values({
			id: standardRowId,
			communityId: home.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const person = makeUser(db, { email: `steward-${slug}@example.org` });
	return {
		ctx: {
			user: person,
			community: home,
			membership: makeMembership(db, home.id, person.id, { role: 'steward', isOwner: true }),
			now: () => NOW
		} as Ctx,
		standardRowId
	};
}

function adopt(ctx: Ctx, standardRowId: string, body: string): string {
	const id = newId();
	const versionId = newId();
	db.insert(definition)
		.values({
			id,
			communityId: ctx.community.id,
			scope: 'standard',
			communityStandardId: standardRowId,
			sectionKey: COUNTABLE.owner!,
			adoptedVersionId: versionId,
			provisional: false,
			createdBy: ctx.user.id,
			createdAt: new Date(NOW),
			updatedAt: new Date(NOW)
		})
		.run();
	db.insert(definitionVersion)
		.values({
			id: versionId,
			definitionId: id,
			n: 1,
			body,
			plainLanguage: null,
			type: null,
			authorId: ctx.user.id,
			aiAssisted: false,
			aiTask: null,
			linterResult: null,
			createdAt: new Date(NOW),
			adoptedAt: new Date(NOW),
			decisionId: null,
			supersedesVersionId: null
		})
		.run();
	return id;
}

let anaStandard: string;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const first = seed('valle-verde');
	ana = first.ctx;
	anaStandard = first.standardRowId;
	bo = seed('other-place').ctx;
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const SECRET = 'A sentence that belongs to Valle Verde alone.';

describe('every outward path this phase added', () => {
	it('shows one community nothing of another', () => {
		adopt(ana, anaStandard, SECRET);

		// Each of the four, by name, so a fifth added later has no precedent for
		// being left out.
		expect(publishedArtifacts(db, anonymousIn(bo.community.id))).toEqual([]);
		expect(
			renderArtifact(db, asSignedIn(bo), view.artifacts[0]!.key)?.sections.every(
				(s) => s.body === null
			)
		).toBe(true);
		expect(
			Object.values(mirrorFiles(db, mirrorAudience(bo.community.id, null), bo.community.id)).join(
				'\n'
			)
		).not.toContain(SECRET);

		const bundle = buildBundle(db, asSignedIn(bo), NOW);
		expect(new TextDecoder().decode(bundle.bytes)).not.toContain(SECRET);
	});

	it('shows the world only what was published', () => {
		const id = adopt(ana, anaStandard, SECRET);

		// Adopted but not published: the public surface has nothing.
		expect(publishedArtifacts(db, anonymousIn(ana.community.id))).toEqual([]);
		const before = renderArtifact(db, anonymousIn(ana.community.id), view.artifacts[0]!.key);
		expect(before?.sections.every((section) => section.body === null)).toBe(true);

		publish(ana, { type: 'definition', id }, { db });

		expect(publishedArtifacts(db, anonymousIn(ana.community.id)).length).toBeGreaterThan(0);
	});

	it('never lets the outward claim carry an inward number', () => {
		const claim = outwardClaim(anonymousIn(ana.community.id), { db })!;
		// The structural guard, asserted on the anonymous path specifically —
		// which is the one that ends up in somebody's screenshot.
		expect(Object.keys(claim)).not.toContain('percent');
		expect(Object.keys(claim)).not.toContain('readiness');
		expect(JSON.stringify(claim)).not.toMatch(/"(authored|answered|satisfied|countable)":/);
	});

	it('renders a scoped audience exactly what it was scoped to', () => {
		adopt(ana, anaStandard, SECRET);

		// The mirror's audience. A `scoped` reader has no permissions to consult,
		// so what it may see is entirely what it was given — which is the property
		// that makes it safe for a background job.
		const worldOnly = mirrorFiles(db, scopedTo(ana.community.id, ['world']), ana.community.id);
		expect(Object.values(worldOnly).join('\n')).not.toContain(SECRET);

		const members = mirrorFiles(
			db,
			scopedTo(ana.community.id, ['member', 'world']),
			ana.community.id
		);
		expect(Object.values(members).join('\n')).toContain(SECRET);
	});
});
