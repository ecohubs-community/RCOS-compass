import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { newId } from '../../src/lib/server/db/id.js';
import { decision } from '../../src/lib/server/db/schema/decisions.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import { membership } from '../../src/lib/server/db/schema/tenancy.js';
import { notify } from '../../src/lib/server/services/notifications.js';
import {
	notificationTarget,
	notificationTargets
} from '../../src/lib/server/services/notification-subjects.js';
import { createTestDb } from '../support/db.js';
import { makeDocument } from '../support/documents.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Who can receive a notification, and whether what it is about is still there
 * for them. `openspec/changes/notifications-page`.
 */
const NOW = Date.UTC(2026, 8, 14, 12, 0);

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	const home = makeCommunity(db, { slug: 'valle-verde' });
	const steward = makeUser(db, { email: 'ana@example.org' });
	ana = {
		user: steward,
		community: home,
		membership: makeMembership(db, home.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	};
	const member = makeUser(db, { email: 'lena@example.org' });
	lena = {
		...ana,
		user: member,
		membership: makeMembership(db, home.id, member.id, { role: 'member' })
	};
});

afterEach(() => {
	setDbForTests(null);
	cleanup();
});

const decisionOf = (communityId: string, visibility: 'member' | 'restricted', n: number) => {
	const id = newId();
	db.insert(decision)
		.values({
			id,
			communityId,
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
			decidedAt: new Date(NOW),
			reviewDueAt: null,
			source: 'online',
			provisional: false,
			status: 'active',
			supersededById: null,
			idempotencyKey: `key-${n}`,
			visibility,
			firstPublishedAt: null,
			recordedBy: null,
			proposalPostId: null
		})
		.run();
	return id;
};

const tell = (ctx: Ctx, recipients: string[]) =>
	notify(db, ctx, {
		kind: 'decision.frozen',
		subjectType: 'decision',
		subjectId: 'd1',
		summary: 'Spending authority',
		params: { title: 'Spending authority', ref: 'DEC-2026-001' },
		recipients
	});

describe('who a notification reaches', () => {
	it('reaches current members of the community and stores values, not a sentence', () => {
		expect(tell(ana, [lena.membership.id])).toBe(1);
		const [row] = db.select().from(notification).all();
		expect(row!.params).toEqual({ title: 'Spending authority', ref: 'DEC-2026-001' });
	});

	it('drops a membership that has ended, whatever the caller named', () => {
		db.update(membership)
			.set({ endedAt: new Date(NOW) })
			.where(eq(membership.id, lena.membership.id))
			.run();
		expect(tell(ana, [lena.membership.id])).toBe(0);
		expect(db.select().from(notification).all()).toEqual([]);
	});

	it('drops a membership of another community', () => {
		const elsewhere = makeCommunity(db, { slug: 'elsewhere' });
		const marco = makeUser(db, { email: 'marco@example.org' });
		const theirs = makeMembership(db, elsewhere.id, marco.id, { role: 'member' });
		expect(tell(ana, [theirs.id, lena.membership.id])).toBe(1);
		expect(
			db
				.select()
				.from(notification)
				.all()
				.map((row) => row.recipientMembershipId)
		).toEqual([lena.membership.id]);
	});

	it('skips the member who acted', () => {
		expect(tell(ana, [ana.membership.id])).toBe(0);
	});
});

describe('what a notification points at', () => {
	it('finds a visible decision by its reference', () => {
		const id = decisionOf(ana.community.id, 'member', 1);
		expect(notificationTarget(db, lena, 'decision', id)).toEqual({
			type: 'decision',
			ref: 'DEC-2026-001'
		});
	});

	it('answers nothing for a decision restricted from this member', () => {
		const id = decisionOf(ana.community.id, 'restricted', 2);
		expect(notificationTarget(db, lena, 'decision', id)).toBeNull();
	});

	it('answers nothing for a document since removed', () => {
		expect(notificationTarget(db, lena, 'document', 'removed-document')).toBeNull();
		const kept = makeDocument(db, ana.community.id);
		expect(notificationTarget(db, lena, 'document', kept.id)).toEqual({
			type: 'document',
			id: kept.id
		});
	});

	it('answers nothing for another community’s subject', () => {
		const elsewhere = makeCommunity(db, { slug: 'elsewhere' });
		const theirs = decisionOf(elsewhere.id, 'member', 3);
		const theirDocument = makeDocument(db, elsewhere.id);
		expect(notificationTarget(db, lena, 'decision', theirs)).toBeNull();
		expect(notificationTarget(db, lena, 'document', theirDocument.id)).toBeNull();
		expect(notificationTarget(db, lena, 'community', elsewhere.id)).toBeNull();
		expect(notificationTarget(db, lena, 'community', ana.community.id)).toEqual({
			type: 'community'
		});
	});

	it('checks two hundred subjects with one query per kind of subject', () => {
		const decisions = Array.from({ length: 100 }, (_, i) =>
			decisionOf(ana.community.id, 'member', i + 10)
		);
		const documents = Array.from({ length: 100 }, () => makeDocument(db, ana.community.id).id);
		const select = vi.spyOn(db, 'select');

		const found = notificationTargets(db, lena, [
			...decisions.map((subjectId) => ({ subjectType: 'decision', subjectId })),
			...documents.map((subjectId) => ({ subjectType: 'document', subjectId }))
		]);

		expect(found.size).toBe(200);
		expect(select).toHaveBeenCalledTimes(2);
		select.mockRestore();
	});
});
