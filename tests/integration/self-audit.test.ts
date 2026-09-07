import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { anonymousIn } from '../../src/lib/server/auth/audience.js';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { outwardClaim } from '../../src/lib/server/services/claim.js';
import { compliance, readiness } from '../../src/lib/server/services/readiness.js';
import type { AuditSnapshot } from '../../src/lib/server/services/self-audit.js';
import { listSelfAudits, runSelfAudit } from '../../src/lib/server/services/self-audit.js';
import { restrict } from '../../src/lib/server/services/visibility.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The self-audit, and the three things it must not be.
 *
 * Not a computation — it changes nothing, and readiness is identical either
 * side of it. Not an approval — nothing it produces says a community has been
 * certified. And not a public document: it names what a community is
 * restricting and why, which is precisely what an anonymous surface must never
 * carry. The public index cites its date and nothing else from it.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const LATER = NOW + 30 * 86_400_000;
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;
let standardRowId: string;

function adopt(overrides: Partial<typeof definition.$inferInsert> = {}): string {
	const id = newId();
	const versionId = newId();
	db.insert(definition)
		.values({
			id,
			communityId: ana.community.id,
			scope: 'standard',
			communityStandardId: standardRowId,
			sectionKey: COUNTABLE.owner!,
			adoptedVersionId: versionId,
			provisional: false,
			createdBy: ana.user.id,
			createdAt: new Date(NOW),
			updatedAt: new Date(NOW),
			...overrides
		})
		.run();
	db.insert(definitionVersion)
		.values({
			id: versionId,
			definitionId: id,
			n: 1,
			body: 'Members may leave at any time.',
			plainLanguage: null,
			type: null,
			authorId: ana.user.id,
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

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const home = makeCommunity(db, { slug: 'valle-verde' });
	standardRowId = newId();
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
	const steward = makeUser(db, { email: 'ana@example.org' });
	ana = {
		user: steward,
		community: home,
		membership: makeMembership(db, home.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
	const member = makeUser(db, { email: 'lena@example.org' });
	lena = {
		...ana,
		user: member,
		membership: makeMembership(db, home.id, member.id, { role: 'member' })
	};
});

afterEach(() => {
	vi.unstubAllEnvs();
	resetConfigForTests();
	setDbForTests(null);
	cleanup();
});

const snapshotOf = (audit: { snapshot: unknown }) => audit.snapshot as AuditSnapshot;

describe('running one changes nothing', () => {
	it('leaves readiness and compliance exactly where they were', () => {
		adopt();
		const before = { readiness: readiness(ana, { db }), compliance: compliance(ana, { db }) };

		runSelfAudit(ana, { db });

		// An audit that fixes things is not an audit.
		expect(readiness(ana, { db })).toEqual(before.readiness);
		expect(compliance(ana, { db })).toEqual(before.compliance);
	});

	it('gives two people the same answer on unchanged state', () => {
		adopt();
		// Two stewards, because running one is a steward's act. The property is
		// that the answer is a function of the records rather than of who asked.
		const other = makeUser(db, { email: 'bo@example.org' });
		const bo = {
			...ana,
			user: other,
			membership: makeMembership(db, ana.community.id, other.id, { role: 'steward' })
		} as Ctx;

		const first = snapshotOf(runSelfAudit(ana, { db }));
		expect(snapshotOf(runSelfAudit(bo, { db }))).toEqual(first);
	});

	it('is refused for a member', () => {
		expect(catchRefusal(() => runSelfAudit(lena, { db }))?.status).toBe(403);
	});

	it('produces the same answer with no AI provider, because none is involved', () => {
		adopt();
		const withProvider = snapshotOf(runSelfAudit(ana, { db }));

		vi.stubEnv('AI_PROVIDER', 'null');
		resetConfigForTests();

		expect(snapshotOf(runSelfAudit(ana, { db }))).toEqual(withProvider);
	});
});

describe('the snapshot says what an auditor asks for', () => {
	it('names the incomplete artifacts and the uncovered clauses', () => {
		const snapshot = snapshotOf(runSelfAudit(ana, { db }));

		expect(snapshot.incompleteArtifacts.length).toBeGreaterThan(0);
		// Named, not counted: "four artifacts missing" is not something anybody
		// can act on.
		expect(snapshot.incompleteArtifacts[0]!.title.length).toBeGreaterThan(0);
		expect(snapshot.uncoveredClauses.length).toBeGreaterThan(0);
	});

	it('lists a provisional definition with when it was adopted', () => {
		adopt({ provisional: true });
		const snapshot = snapshotOf(runSelfAudit(ana, { db }));
		expect(snapshot.provisional).toHaveLength(1);
		expect(snapshot.provisional[0]!.adoptedAt).toBe(NOW);
	});

	it('lists a definition past its review date', () => {
		adopt({ reviewDueAt: new Date(NOW - 86_400_000) });
		expect(snapshotOf(runSelfAudit(ana, { db })).pastReview).toHaveLength(1);
	});

	it("lists the community's own stale rules separately, and marks them", () => {
		adopt({
			scope: 'local',
			sectionKey: null,
			communityStandardId: null,
			attachKind: 'rcos_artifact',
			attachRcosArtifactKey: 'purpose-charter',
			title: 'Quiet hours',
			reviewDueAt: new Date(NOW - 86_400_000)
		});
		const snapshot = snapshotOf(runSelfAudit(ana, { db }));

		// RCOS does not care about these and the community does. Folding them in
		// would say a community is further from compliance than it is.
		expect(snapshot.localPastReview).toHaveLength(1);
		expect(snapshot.pastReview).toEqual([]);
		expect(snapshot.localPastReview[0]!.title).toBe('Quiet hours');
	});

	it('lists a live transparency exception with its expiry', () => {
		const id = adopt();
		restrict(
			ana,
			{ type: 'definition', id },
			{
				justification: 'Asked for by the member it concerns.',
				audience: 'stewards',
				expiresAt: new Date(LATER)
			},
			{ db }
		);

		const snapshot = snapshotOf(runSelfAudit(ana, { db }));
		expect(snapshot.exceptions).toHaveLength(1);
		expect(snapshot.exceptions[0]!.expiresAt).toBe(LATER);
	});
});

describe('an audit is a fixed moment', () => {
	it('still says what was true after the state moves', () => {
		const before = snapshotOf(runSelfAudit(ana, { db }));
		const uncovered = before.uncoveredClauses.length;

		adopt();

		expect(snapshotOf(listSelfAudits(ana, { db })[0]!).uncoveredClauses).toHaveLength(uncovered);
	});

	it('accumulates, newest first', () => {
		runSelfAudit(ana, { db });
		runSelfAudit({ ...ana, now: () => LATER }, { db });

		const all = listSelfAudits(ana, { db });
		expect(all).toHaveLength(2);
		expect(all[0]!.runAt.getTime()).toBe(LATER);
	});
});

describe('the public index cites the date and nothing else', () => {
	it('says never when there has been none', () => {
		expect(outwardClaim(anonymousIn(ana.community.id), { db })!.lastAuditAt).toBeNull();
	});

	it('carries the date once one has run, and no part of the snapshot', () => {
		const id = adopt();
		restrict(
			ana,
			{ type: 'definition', id },
			{
				justification: 'A member asked for their circumstances not to be public.',
				audience: 'stewards',
				expiresAt: new Date(LATER)
			},
			{ db }
		);
		runSelfAudit(ana, { db });

		const claim = outwardClaim(anonymousIn(ana.community.id), { db })!;
		expect(claim.lastAuditAt).toBe(NOW);

		// The snapshot names what is hidden and why. None of it may reach an
		// anonymous surface — the date is the whole of what the appendix asks for.
		const serialised = JSON.stringify(claim);
		expect(serialised).not.toContain('circumstances');
		expect(serialised).not.toContain('exceptions');
		expect(serialised).not.toContain('readiness');
	});
});
