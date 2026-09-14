import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { newId } from '../../src/lib/server/db/id.js';
import { definition, definitionDraft } from '../../src/lib/server/db/schema/definitions.js';
import { definitionSource, evidence, passage } from '../../src/lib/server/db/schema/documents.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { post } from '../../src/lib/server/db/schema/discussions.js';
import { runExtraction } from '../../src/lib/server/documents/extract-job.js';
import { receiveUpload } from '../../src/lib/server/documents/storage.js';
import {
	createDocument,
	deleteDocument,
	listPassages
} from '../../src/lib/server/services/documents.js';
import {
	confirmEvidence,
	definitionOrigin,
	dismissEvidence,
	evidenceForDocument,
	getEvidence,
	languageCoverage,
	mapPassage,
	turnIntoDefinition
} from '../../src/lib/server/services/evidence.js';
import { readiness, compliance } from '../../src/lib/server/services/readiness.js';
import { freeze } from '../../src/lib/server/services/decisions.js';
import { addProposal, openDiscussion } from '../../src/lib/server/services/discussions.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal, catchRefusalAsync } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Evidence: what a community already wrote down, and what that does and does not
 * mean. The change's `evidence` spec.
 *
 * The load-bearing assertion in this file is the one that says a number did
 * **not** move. Everything else here is a convenience; that one is the promise
 * that "we have language about this" and "we decided this" stay different
 * claims, which is what keeps every other number in the product honest.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const FIXTURES = join(import.meta.dirname, '../fixtures/documents');
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let uploadDir: string;
let ctx: Ctx;
let documentId: string;
const clock = fixedClock(NOW);

/** The passage carrying the community's own exit rule. */
function exitPassage() {
	return listPassages(ctx, documentId, { db }).find((row) =>
		row.text.includes('may leave at any time')
	)!;
}

beforeEach(async () => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	uploadDir = mkdtempSync(join(tmpdir(), 'compass-evidence-'));
	vi.stubEnv('UPLOAD_DIR', uploadDir);
	resetConfigForTests();

	const community = makeCommunity(db, { slug: 'valle-verde' });
	const person = makeUser(db, { email: 'ana@example.org' });
	ctx = {
		user: person,
		community,
		membership: makeMembership(db, community.id, person.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	};

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

	const file = new File(
		[readFileSync(join(FIXTURES, 'valle-verde-bylaws.pdf'))],
		'valle-verde-bylaws.pdf'
	);
	const created = await createDocument(
		ctx,
		{ filename: 'valle-verde-bylaws.pdf', file: await receiveUpload(file, community.id) },
		{ db }
	);
	documentId = created.id;
	await runExtraction(db, clock, documentId);
});

afterEach(() => {
	setDbForTests(null);
	vi.unstubAllEnvs();
	resetConfigForTests();
	rmSync(uploadDir, { recursive: true, force: true });
	cleanup();
});

describe('a member maps a passage by hand', () => {
	it('records the claim, with the quote and who stood behind it', () => {
		const passage = exitPassage();
		const claim = mapPassage(ctx, { passageId: passage.id, clause: COUNTABLE.key }, { db });

		expect(claim.state).toBe('confirmed');
		expect(claim.suggestedBy).toBe('human');
		expect(claim.confirmedBy).toBe(ctx.user.id);
		// The quote is kept on the row, so the claim outlives the document.
		expect(claim.quote).toContain('may leave at any time');
	});

	it('accepts the reference a member can actually see', () => {
		// The standard browser prints refs; the stable key is what everything
		// downstream matches on. Members type what is in front of them.
		const passage = exitPassage();
		const claim = mapPassage(ctx, { passageId: passage.id, clause: COUNTABLE.ref }, { db });
		expect(claim.clauseKey).toBe(COUNTABLE.key);
	});

	it('refuses to map a heading, which names a topic rather than answering a clause', () => {
		// Headings are stored so the document can be typeset, never as mapping
		// candidates. Refused in the service, so a crafted form cannot do it.
		const exit = exitPassage();
		db.update(passage).set({ kind: 'heading' }).where(eq(passage.id, exit.id)).run();

		const refusal = catchRefusal(() =>
			mapPassage(ctx, { passageId: exit.id, clause: COUNTABLE.key }, { db })
		);
		expect(refusal?.status).toBe(400);
		expect(db.select().from(evidence).all()).toHaveLength(0);
	});

	it('refuses a clause the standard does not have', () => {
		const passage = exitPassage();
		expect(
			catchRefusal(() => mapPassage(ctx, { passageId: passage.id, clause: 'nonsense' }, { db }))
				?.status
		).toBe(400);
	});

	it('re-mapping the same pair re-confirms rather than duplicating', () => {
		const passage = exitPassage();
		const first = mapPassage(ctx, { passageId: passage.id, clause: COUNTABLE.key }, { db });
		dismissEvidence(ctx, first.id, { db });
		const again = mapPassage(ctx, { passageId: passage.id, clause: COUNTABLE.key }, { db });

		expect(again.id).toBe(first.id);
		expect(again.state).toBe('confirmed');
		expect(db.select().from(evidence).all()).toHaveLength(1);
	});

	it('answers for another community-s passage as if it does not exist', () => {
		const other = makeCommunity(db, { slug: 'other-place' });
		const person = makeUser(db, { email: 'marco@example.org' });
		const theirs: Ctx = {
			user: person,
			community: other,
			membership: makeMembership(db, other.id, person.id, { role: 'steward', isOwner: true }),
			now: () => NOW
		};

		expect(
			catchRefusal(() =>
				mapPassage(theirs, { passageId: exitPassage().id, clause: COUNTABLE.key }, { db })
			)?.status
		).toBe(404);
		// And the document's evidence list answers the same way, rather than with
		// an empty list — two different answers is a difference to read meaning out of.
		expect(catchRefusal(() => evidenceForDocument(theirs, documentId, { db }))?.status).toBe(404);
	});
});

describe('evidence moves no number', () => {
	it('leaves readiness and the compliance claim exactly where they were', () => {
		expect(readiness(ctx, { db })!.percent).toBe(0);

		// Twenty clauses' worth of "we have language about this".
		const passages = listPassages(ctx, documentId, { db });
		const clauses = view.countableClauses().slice(0, 20);
		clauses.forEach((clause, i) => {
			mapPassage(ctx, { passageId: passages[i % passages.length]!.id, clause: clause.key }, { db });
		});

		// A *fresh* context, because readiness memoises per request and the whole
		// point here is to recompute. Asking the same ctx twice reads the memo and
		// asserts nothing — which is how this test first passed against a
		// readiness that did wrongly count evidence.
		const later: Ctx = { ...ctx };
		const after = readiness(later, { db })!;
		expect(after.percent).toBe(0);
		expect(after.satisfied).toBe(0);
		expect(compliance(later, { db })!.compliant).toBe(false);
		// And the artifact arithmetic agrees with the headline number.
		expect(compliance(later, { db })!.incompleteArtifacts.length).toBeGreaterThan(0);
	});

	it('is counted and shown as its own number', () => {
		const passage = exitPassage();
		mapPassage(ctx, { passageId: passage.id, clause: COUNTABLE.key }, { db });

		const coverage = languageCoverage(ctx, { db });
		expect(coverage.have).toBe(1);
		expect(coverage.of).toBe(view.countableClauses().length);
	});

	it('counts only what a person confirmed', () => {
		const passage = exitPassage();
		const claim = mapPassage(ctx, { passageId: passage.id, clause: COUNTABLE.key }, { db });
		dismissEvidence(ctx, claim.id, { db });

		expect(languageCoverage(ctx, { db }).have).toBe(0);
	});
});

describe('dismissing keeps the record', () => {
	it('records who dismissed it, and keeps the row', () => {
		const claim = mapPassage(ctx, { passageId: exitPassage().id, clause: COUNTABLE.key }, { db });
		const dismissed = dismissEvidence(ctx, claim.id, { db });

		expect(dismissed.state).toBe('dismissed');
		expect(dismissed.confirmedBy).toBe(ctx.user.id);
		expect(db.select().from(evidence).all()).toHaveLength(1);
	});

	it('refuses to confirm something already dismissed', () => {
		const claim = mapPassage(ctx, { passageId: exitPassage().id, clause: COUNTABLE.key }, { db });
		dismissEvidence(ctx, claim.id, { db });

		expect(catchRefusal(() => confirmEvidence(ctx, claim.id, { db }))?.status).toBe(409);
	});
});

describe('the community-s own words, on their way to becoming binding', () => {
	it('fills a draft with the passage text, and adopts nothing', () => {
		const claim = mapPassage(ctx, { passageId: exitPassage().id, clause: COUNTABLE.key }, { db });
		const made = turnIntoDefinition(ctx, claim.id, { db });

		expect(made.kind).toBe('draft');
		const id = made.kind === 'draft' ? made.definitionId : '';
		const draft = db
			.select()
			.from(definitionDraft)
			.where(eq(definitionDraft.definitionId, id))
			.get()!;
		expect(draft.body).toContain('may leave at any time');

		// A draft. Not a definition anyone has agreed, and no number has moved.
		const made2 = db.select().from(definition).where(eq(definition.id, id)).get()!;
		expect(made2.adoptedVersionId).toBeNull();
		expect(readiness(ctx, { db })!.percent).toBe(0);
	});

	it('records where the words came from', () => {
		const claim = mapPassage(ctx, { passageId: exitPassage().id, clause: COUNTABLE.key }, { db });
		const made = turnIntoDefinition(ctx, claim.id, { db });
		const id = made.kind === 'draft' ? made.definitionId : '';

		const source = db
			.select()
			.from(definitionSource)
			.where(eq(definitionSource.definitionId, id))
			.get()!;
		// A reader a year later can get from the definition back to the 2019 bylaws.
		expect(source.evidenceId).toBe(claim.id);
		expect(source.passageId).toBe(exitPassage().id);
	});

	it('still says where an adopted definition-s words came from', () => {
		// `recordSource` runs when a definition is created or an empty draft is
		// filled, and `turnIntoDefinition` opens a discussion for anything already
		// written — so the record cannot be rewritten under an adopted version.
		// This is the guard on that: freezing must not lose the provenance.
		const claim = mapPassage(ctx, { passageId: exitPassage().id, clause: COUNTABLE.key }, { db });
		const made = turnIntoDefinition(ctx, claim.id, { db });
		const definitionId = made.kind === 'draft' ? made.definitionId : '';

		const thread = openDiscussion(
			ctx,
			{ title: 'Exit', about: { kind: 'definition', definitionId } },
			{ db }
		);
		addProposal(ctx, { discussionId: thread.id, body: 'A member may leave at any time.' }, { db });
		freeze(
			ctx,
			{
				discussionId: thread.id,
				idempotencyKey: 'provenance',
				title: 'Exit',
				type: 'operational',
				mechanism: 'consent'
			},
			{ db }
		);

		const origin = definitionOrigin(ctx, definitionId, { db })!;
		expect(origin.page).toBe(exitPassage().page);
		expect(origin.filename).toBe('valle-verde-bylaws.pdf');
	});

	it('proposes rather than overwrites when the section already says something', () => {
		const claim = mapPassage(ctx, { passageId: exitPassage().id, clause: COUNTABLE.key }, { db });
		const first = turnIntoDefinition(ctx, claim.id, { db });
		const id = first.kind === 'draft' ? first.definitionId : '';

		// Somebody has since written into that draft.
		db.update(definitionDraft)
			.set({ body: 'Our own wording, typed by hand.' })
			.where(eq(definitionDraft.definitionId, id))
			.run();

		const second = turnIntoDefinition(ctx, claim.id, { db });

		// The passage becomes a proposal in a discussion — the P3 path for changing
		// what a community has said. Nothing already written is overwritten.
		expect(second.kind).toBe('proposal');
		const draft = db
			.select()
			.from(definitionDraft)
			.where(eq(definitionDraft.definitionId, id))
			.get()!;
		expect(draft.body).toBe('Our own wording, typed by hand.');

		const discussionId = second.kind === 'proposal' ? second.discussionId : '';
		const proposals = db.select().from(post).where(eq(post.discussionId, discussionId)).all();
		expect(proposals[0]!.body).toContain('may leave at any time');
	});

	it('refuses to start from a mapping nobody has confirmed', () => {
		const passage = exitPassage();
		const suggestion = newId();
		db.insert(evidence)
			.values({
				id: suggestion,
				communityId: ctx.community.id,
				passageId: passage.id,
				quote: passage.text,
				communityStandardId: db.select().from(communityStandard).all()[0]!.id,
				clauseKey: COUNTABLE.key,
				state: 'suggested',
				confidence: 70,
				suggestedBy: 'ai',
				confirmedBy: null,
				confirmedAt: null,
				createdAt: new Date(NOW)
			})
			.run();

		expect(catchRefusal(() => turnIntoDefinition(ctx, suggestion, { db }))?.status).toBe(409);
	});
});

describe('evidence goes stale rather than disappearing', () => {
	it('survives the document it came from, readable and attributed', async () => {
		const claim = mapPassage(ctx, { passageId: exitPassage().id, clause: COUNTABLE.key }, { db });

		await deleteDocument(ctx, documentId, { db });

		const after = getEvidence(ctx, claim.id, { db });
		expect(after.state).toBe('stale');
		// What they said they had, and who said it, both survive.
		expect(after.quote).toContain('may leave at any time');
		expect(after.confirmedBy).toBe(ctx.user.id);
		expect(after.passageId).toBeNull();
	});

	it('stops counting toward the language number once stale', async () => {
		mapPassage(ctx, { passageId: exitPassage().id, clause: COUNTABLE.key }, { db });
		expect(languageCoverage(ctx, { db }).have).toBe(1);

		await deleteDocument(ctx, documentId, { db });
		expect(languageCoverage(ctx, { db }).have).toBe(0);
	});

	it('leaves a dismissal dismissed', async () => {
		const claim = mapPassage(ctx, { passageId: exitPassage().id, clause: COUNTABLE.key }, { db });
		dismissEvidence(ctx, claim.id, { db });

		await deleteDocument(ctx, documentId, { db });

		// Already settled by a person; staleness is not an upgrade path out of it.
		expect(getEvidence(ctx, claim.id, { db }).state).toBe('dismissed');
	});

	it('cannot be confirmed once its passage is gone', async () => {
		const passage = exitPassage();
		const standardId = db.select().from(communityStandard).all()[0]!.id;
		const suggestion = newId();
		db.insert(evidence)
			.values({
				id: suggestion,
				communityId: ctx.community.id,
				passageId: passage.id,
				quote: passage.text,
				communityStandardId: standardId,
				clauseKey: COUNTABLE.key,
				state: 'suggested',
				confidence: null,
				suggestedBy: 'ai',
				confirmedBy: null,
				confirmedAt: null,
				createdAt: new Date(NOW)
			})
			.run();

		await deleteDocument(ctx, documentId, { db });
		expect(catchRefusal(() => confirmEvidence(ctx, suggestion, { db }))?.status).toBe(409);
	});
});

describe('a suspended community', () => {
	it('reads its evidence and writes none', async () => {
		const claim = mapPassage(ctx, { passageId: exitPassage().id, clause: COUNTABLE.key }, { db });
		const suspended: Ctx = {
			...ctx,
			community: { ...ctx.community, status: 'suspended', suspendedReason: 'Non-payment.' }
		};

		expect(getEvidence(suspended, claim.id, { db }).id).toBe(claim.id);
		expect(
			catchRefusal(() =>
				mapPassage(suspended, { passageId: exitPassage().id, clause: 'l1.membership.1' }, { db })
			)?.status
		).toBe(409);
		expect(
			(await catchRefusalAsync(async () => turnIntoDefinition(suspended, claim.id, { db })))?.status
		).toBe(409);
	});
});
