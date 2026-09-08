import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { changeLog, decision, decisionAttendee } from '../../src/lib/server/db/schema/decisions.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { discussion, objection, post } from '../../src/lib/server/db/schema/discussions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { correctDefinition } from '../../src/lib/server/services/definitions.js';
import { redact, REDACTION_MARKER } from '../../src/lib/server/services/redaction.js';
import { indexDefinition } from '../../src/lib/server/services/search.js';
import { getSearchIndex } from '../../src/lib/server/search/index.js';
import { visibleLevels } from '../../src/lib/server/auth/visible-to.js';
import { asSignedIn } from '../../src/lib/server/auth/audience.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Taking a name out of what somebody wrote, without making the record less true.
 * `docs/03-data-model.md` §10.
 *
 * Two properties carry this file. The removed words must be gone from
 * *everywhere they were copied* — the body, and the search index that holds its
 * own copy — because a name that survives in a search box has not been removed.
 * And the change-log entry must say a redaction happened without saying what it
 * removed, which is the mistake that looks like diligence.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const NAME = 'Wilhelmina Kastenbaum';
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let lena: Ctx;
let standardRowId: string;

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

	const steward = makeUser(db, { email: 'ana@example.org', name: 'Ana Restrepo' });
	ana = {
		user: steward,
		community: home,
		membership: makeMembership(db, home.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	} as Ctx;
	const member = makeUser(db, { email: 'lena@example.org', name: 'Lena Vogt' });
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

/** An adopted definition whose text names somebody. */
function adopt(body = `The dispute with ${NAME} is settled by mediation.`): {
	definitionId: string;
	versionId: string;
} {
	const definitionId = newId();
	const versionId = newId();
	db.insert(definition)
		.values({
			id: definitionId,
			communityId: ana.community.id,
			scope: 'standard',
			communityStandardId: standardRowId,
			sectionKey: COUNTABLE.owner!,
			adoptedVersionId: versionId,
			provisional: false,
			createdBy: ana.user.id,
			createdAt: new Date(NOW),
			updatedAt: new Date(NOW)
		})
		.run();
	db.insert(definitionVersion)
		.values({
			id: versionId,
			definitionId,
			n: 1,
			body,
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
	// Indexed the way the application indexes it, so the test is about redaction
	// rather than about a fixture that never reached the index.
	indexDefinition(db, ana.community.id, definitionId);
	return { definitionId, versionId };
}

function decide(): string {
	const id = newId();
	db.insert(decision)
		.values({
			id,
			communityId: ana.community.id,
			seq: 1,
			ref: 'DEC-2026-001',
			title: 'Mediation',
			type: 'strategic',
			layer: null,
			mechanism: 'consent',
			threshold: null,
			tallyPresent: 11,
			tallyFor: 11,
			tallyAgainst: 0,
			unresolvedObjections: 0,
			rationale: `Raised after ${NAME} objected.`,
			proposalText: 'Disputes go to mediation.',
			decidedAt: new Date(NOW),
			reviewDueAt: null,
			source: 'online',
			provisional: false,
			status: 'active',
			supersededById: null,
			idempotencyKey: 'k1',
			recordedBy: ana.user.id,
			proposalPostId: null
		})
		.run();
	return id;
}

const reason = 'The person named asked to be removed from it.';

describe('a redaction removes the words and says that it did', () => {
	it('replaces them in the body and in the index', () => {
		const { definitionId, versionId } = adopt();
		const find = (text: string) =>
			getSearchIndex(db).query(ana.community.id, text, {
				levels: visibleLevels(asSignedIn(ana))
			});
		expect(find('Kastenbaum').length).toBeGreaterThan(0);

		redact(
			ana,
			{ target: { type: 'definition_version', id: versionId }, span: NAME, reason },
			{ db }
		);

		const body = db
			.select()
			.from(definitionVersion)
			.where(eq(definitionVersion.id, versionId))
			.get()!.body;
		expect(body).not.toContain(NAME);
		expect(body).toContain(REDACTION_MARKER);
		// The index holds its own copy. A name still findable through the search
		// box has not been removed, whatever the page shows.
		expect(find('Kastenbaum')).toEqual([]);
		expect(definitionId).toBeTruthy();
	});

	it('records that one happened, and never what went', () => {
		const { versionId } = adopt();

		redact(
			ana,
			{ target: { type: 'definition_version', id: versionId }, span: NAME, reason },
			{ db }
		);

		const entries = db.select().from(changeLog).all();
		expect(entries.map((row) => row.kind)).toEqual(['record.redacted']);
		expect(entries[0]!.actorId).toBe(ana.user.id);
		expect(entries[0]!.summary).toBe(reason);
		// The whole row, because a change log that quotes the removed text has not
		// removed it — including in a payload nobody was reading.
		expect(JSON.stringify(entries[0])).not.toContain(NAME);
	});

	it('reaches a discussion post and an objection, which is where a name is typed', () => {
		const discussionId = newId();
		const postId = newId();
		const objectionId = newId();
		db.insert(discussion)
			.values({
				id: discussionId,
				communityId: ana.community.id,
				title: 'Mediation',
				clauseKey: null,
				origin: 'clause',
				openedBy: ana.user.id,
				openedAt: new Date(NOW),
				lastActivityAt: new Date(NOW),
				status: 'open'
			})
			.run();
		db.insert(post)
			.values({
				id: postId,
				discussionId,
				authorId: ana.user.id,
				body: `${NAME} said this would not work.`,
				kind: 'proposal',
				proposalVersion: 1,
				frozenDecisionId: null,
				createdAt: new Date(NOW)
			})
			.run();
		db.insert(objection)
			.values({
				id: objectionId,
				proposalPostId: postId,
				raisedBy: ana.user.id,
				reason: `${NAME} would be affected.`,
				raisedAt: new Date(NOW),
				state: 'open',
				resolvedBy: null,
				resolvedAt: null,
				resolutionNote: null
			})
			.run();

		redact(ana, { target: { type: 'post', id: postId }, span: NAME, reason }, { db });
		redact(ana, { target: { type: 'objection', id: objectionId }, span: NAME, reason }, { db });

		expect(db.select().from(post).get()!.body).not.toContain(NAME);
		expect(db.select().from(objection).get()!.reason).not.toContain(NAME);
	});

	it('reaches somebody who was present and never had an account', () => {
		const decisionId = decide();
		const attendeeId = newId();
		db.insert(decisionAttendee)
			.values({
				id: attendeeId,
				decisionId,
				membershipId: null,
				externalName: NAME,
				consentedToPublish: false
			})
			.run();

		redact(
			ana,
			{ target: { type: 'external_attendee', id: attendeeId }, span: NAME, reason },
			{ db }
		);

		const row = db.select().from(decisionAttendee).get()!;
		expect(row.externalName).toBe(REDACTION_MARKER);
		// The row stays, because it is what makes the tally true. They were there.
		expect(db.select().from(decisionAttendee).all()).toHaveLength(1);
	});
});

describe('what a redaction may not do', () => {
	it('is refused for a member', () => {
		const { versionId } = adopt();
		expect(
			catchRefusal(() =>
				redact(
					lena,
					{ target: { type: 'definition_version', id: versionId }, span: NAME, reason },
					{ db }
				)
			)?.status
		).toBe(403);
	});

	it('leaves the decision’s structure alone', () => {
		const decisionId = decide();
		const before = JSON.stringify(db.select().from(decision).get());

		redact(
			ana,
			{ target: { type: 'decision_rationale', id: decisionId }, span: NAME, reason },
			{ db }
		);

		const after = db.select().from(decision).get()!;
		// The rationale changed and nothing else did: the ref, the date, the
		// mechanism and the tally are what the record *is*.
		expect(after.ref).toBe('DEC-2026-001');
		expect(after.tallyPresent).toBe(11);
		expect(after.tallyFor).toBe(11);
		expect(after.decidedAt.getTime()).toBe(NOW);
		expect(before).not.toBe(JSON.stringify(after));
	});

	it('refuses when the words are not there', () => {
		const { versionId } = adopt('Nobody is named in this one.');
		// Recording a redaction that changed nothing would put "a name was removed"
		// in the log of a record that still contains it.
		expect(
			catchRefusal(() =>
				redact(
					ana,
					{ target: { type: 'definition_version', id: versionId }, span: NAME, reason },
					{ db }
				)
			)?.status
		).toBe(409);
		expect(db.select().from(changeLog).all()).toEqual([]);
	});

	it('refuses without a reason', () => {
		const { versionId } = adopt();
		expect(
			catchRefusal(() =>
				redact(
					ana,
					{ target: { type: 'definition_version', id: versionId }, span: NAME, reason: ' ' },
					{ db }
				)
			)?.status
		).toBe(400);
	});
});

describe('a correction supersedes rather than overwrites', () => {
	it('adds a version, keeps the old one, and says why', () => {
		const { definitionId, versionId } = adopt('Disputes go to mediaton.');

		const corrected = correctDefinition(
			ana,
			{ definitionId, body: 'Disputes go to mediation.', reason: 'Spelling.' },
			{ db }
		);

		const versions = db.select().from(definitionVersion).all();
		expect(versions).toHaveLength(2);
		// The superseded text is still readable — that is the difference between a
		// correction and a redaction, and why a correction alone does not answer an
		// erasure request.
		expect(versions.find((row) => row.id === versionId)!.body).toBe('Disputes go to mediaton.');
		expect(db.select().from(definition).get()!.adoptedVersionId).toBe(corrected);
		expect(db.select().from(changeLog).all()[0]!.kind).toBe('definition.corrected');
	});

	it('is refused for a member, and without a reason', () => {
		const { definitionId } = adopt();
		expect(
			catchRefusal(() => correctDefinition(lena, { definitionId, body: 'x', reason: 'y' }, { db }))
				?.status
		).toBe(403);
		expect(
			catchRefusal(() => correctDefinition(ana, { definitionId, body: 'x', reason: ' ' }, { db }))
				?.status
		).toBe(400);
	});
});
