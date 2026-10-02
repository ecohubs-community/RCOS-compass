import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { decision } from '../../src/lib/server/db/schema/decisions.js';
import { communityArtifact, definition } from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { artifactDetail } from '../../src/lib/server/services/artifacts.js';
import { artifactProgress } from '../../src/lib/server/services/completeness.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import { createDefinition } from '../../src/lib/server/services/definitions.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import {
	publish,
	publishArtifact,
	withdrawArtifact
} from '../../src/lib/server/services/publishing.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * `provenance-ui` group 4: the artifact page's read, and publishing an artifact
 * as a decision — which the `publishing` and `decisions` specs required and the
 * code did not do.
 */
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const CHARTER = 'purpose-charter';
const PRIMARY = 'purpose-charter.primary-purpose';

let db: Db;
let cleanup: () => void;
let ctx: Ctx;
let memberCtx: Ctx;

function seedCommunity(slug: string) {
	const community = makeCommunity(db, { slug });
	db.insert(communityStandard)
		.values({
			id: newId(),
			communityId: community.id,
			standardId: 'rcos-core',
			version: '0.1',
			status: 'active',
			adoptedAt: new Date(NOW),
			retiredAt: null
		})
		.run();
	const person = makeUser(db, { email: `steward-${slug}@example.org`, name: 'Ana' });
	const seat = makeMembership(db, community.id, person.id, { role: 'steward', isOwner: true });
	return { user: person, community, membership: seat, now: () => NOW } as Ctx;
}

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	ctx = seedCommunity('valle-verde');
	const person = makeUser(db, { email: 'lena@example.org', name: 'Lena' });
	memberCtx = {
		...ctx,
		user: person,
		membership: makeMembership(db, ctx.community.id, person.id, { role: 'member' })
	};
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

let key = 0;
function adoptSection(sectionKey: string, on: Ctx = ctx) {
	const thread = openDiscussion(
		on,
		{ title: 'Thread', about: { kind: 'section', sectionKey } },
		{ db }
	);
	addProposal(on, { discussionId: thread.id, body: 'Our answer.' }, { db });
	freeze(
		on,
		{
			discussionId: thread.id,
			idempotencyKey: `k-${(key += 1)}`,
			title: 'Decided',
			type: 'strategic',
			mechanism: 'consent'
		} as Parameters<typeof freeze>[1],
		{ db }
	);
	return db.select().from(definition).where(eq(definition.sectionKey, sectionKey)).all().at(-1)!;
}
const decisions = () => db.select().from(decision).all();

describe('the artifact page', () => {
	it('lists every section, counts only those a community writes, and names what is missing', () => {
		const detail = artifactDetail(memberCtx, CHARTER, { db });
		expect(detail).toMatchObject({ answered: 0, authored: 4, percent: 0, complete: false });
		expect(
			detail.sections.find((s) => s.key === 'purpose-charter.ratification-record')
		).toMatchObject({ counted: false });
		expect(detail.blockers.filter((b) => b.kind === 'missing')).toHaveLength(4);
		expect(detail.publication).toBe('nothing_adopted');
	});

	it('counts what readiness counts, and shows the share of sections', () => {
		adoptSection(PRIMARY);
		const detail = artifactDetail(ctx, CHARTER, { db });
		const progress = artifactProgress(ctx, CHARTER, { db });
		expect([detail.answered, detail.authored]).toEqual([progress.answered, progress.authored]);
		expect(detail.percent).toBe(25);
		expect(detail.sections.find((s) => s.key === PRIMARY)).toMatchObject({ status: 'adopted' });
		// Adopted before the Decision Matrix: provisional, which costs compliance.
		expect(detail.blockers).toContainEqual(
			expect.objectContaining({ kind: 'provisional', sectionKey: PRIMARY })
		);
	});

	it('keeps local additions apart, and out of the count', () => {
		adoptSection(PRIMARY);
		createDefinition(
			memberCtx,
			{
				scope: 'local',
				title: 'Why we garden',
				layer: 0,
				attach: { kind: 'rcos_artifact', artifactKey: CHARTER }
			},
			{ db }
		);
		const detail = artifactDetail(ctx, CHARTER, { db });
		expect(detail.local.map((l) => l.title)).toEqual(['Why we garden']);
		expect([detail.answered, detail.authored]).toEqual([1, 4]);
	});

	it('names a Layer 0 rule hidden from members as a blocker, and hides it from a member', () => {
		const row = adoptSection(PRIMARY);
		db.update(definition).set({ visibility: 'restricted' }).where(eq(definition.id, row.id)).run();
		const forSteward = artifactDetail(ctx, CHARTER, { db });
		expect(forSteward.blockers).toContainEqual(
			expect.objectContaining({ kind: 'restricted', sectionKey: PRIMARY, definitionId: row.id })
		);
		const forMember = artifactDetail(memberCtx, CHARTER, { db });
		expect(forMember.sections.find((s) => s.key === PRIMARY)).toMatchObject({
			restricted: true,
			definitionId: null
		});
	});

	it('is not found for a key the standard does not have', () => {
		expect(catchRefusal(() => artifactDetail(ctx, 'nothing-like-this', { db }))?.status).toBe(404);
	});

	it('shows nothing another community adopted', () => {
		const other = seedCommunity('rio-claro');
		adoptSection(PRIMARY, other);
		expect(artifactDetail(ctx, CHARTER, { db }).answered).toBe(0);
	});
});

describe('publishing an artifact is a decision', () => {
	it('writes one decision with the next reference, and the history links to it', () => {
		adoptSection(PRIMARY);
		const before = decisions().length;
		publishArtifact(ctx, CHARTER, { db });

		const written = decisions();
		expect(written).toHaveLength(before + 1);
		const record = written.at(-1)!;
		expect(record).toMatchObject({
			seq: before + 1,
			ref: `DEC-2026-00${before + 1}`,
			title: 'Published Purpose Charter',
			type: 'operational',
			mechanism: 'steward act'
		});
		expect(record.proposalText).toContain('Primary Purpose — v1');
		const detail = artifactDetail(ctx, CHARTER, { db });
		expect(detail.publication).toBe('public');
		expect(detail.history).toEqual([
			expect.objectContaining({ published: true, ref: record.ref, by: 'Ana' })
		]);
	});

	it('writes nothing when it is already public, and a decision again when withdrawn', () => {
		adoptSection(PRIMARY);
		publishArtifact(ctx, CHARTER, { db });
		const after = decisions().length;
		publishArtifact(ctx, CHARTER, { db });
		expect(decisions()).toHaveLength(after);
		withdrawArtifact(ctx, CHARTER, { db });
		expect(decisions().at(-1)!.title).toBe('Withdrew Purpose Charter from public view');
		expect(artifactDetail(ctx, CHARTER, { db }).history.map((h) => h.published)).toEqual([
			false,
			true
		]);
	});

	it('takes no reference when it is refused part-way', () => {
		const primary = adoptSection(PRIMARY);
		adoptSection('purpose-charter.secondary-purposes');
		db.update(definition)
			.set({ visibility: 'restricted' })
			.where(eq(definition.id, primary.id))
			.run();
		const before = decisions().length;
		expect(catchRefusal(() => publishArtifact(ctx, CHARTER, { db }))?.status).toBe(409);
		expect(decisions()).toHaveLength(before);
		expect(
			db
				.select()
				.from(definition)
				.all()
				.filter((row) => row.visibility === 'world')
		).toHaveLength(0);
	});

	it('refuses a member, and an artifact with nothing adopted', () => {
		adoptSection(PRIMARY);
		expect(catchRefusal(() => publishArtifact(memberCtx, CHARTER, { db }))?.status).toBe(403);
		expect(catchRefusal(() => publishArtifact(ctx, 'scope-declaration', { db }))?.status).toBe(409);
	});

	it('records a community artifact published through the settings path too', () => {
		const id = newId();
		db.insert(communityArtifact)
			.values({
				id,
				communityId: ctx.community.id,
				title: 'Community Agreements',
				layer: null,
				kind: 'default',
				createdAt: new Date(NOW)
			})
			.run();
		publish(ctx, { type: 'artifact', id }, { db });
		expect(decisions().at(-1)!.title).toBe('Published Community Agreements');
	});
});
