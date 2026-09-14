import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { setAiProviderForTests, type AiProvider } from '../../src/lib/server/ai/index.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { document, evidence, passage } from '../../src/lib/server/db/schema/documents.js';
import { job } from '../../src/lib/server/db/schema/jobs.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import { community, membership } from '../../src/lib/server/db/schema/tenancy.js';
import { runExtraction } from '../../src/lib/server/documents/extract-job.js';
import { receiveUpload } from '../../src/lib/server/documents/storage.js';
import { runScanJob } from '../../src/lib/server/jobs/scan-job.js';
import { createDocument, getDocument } from '../../src/lib/server/services/documents.js';
import {
	runScanStep,
	scanAvailability,
	startScan,
	type ScanPayload
} from '../../src/lib/server/services/mapping.js';
import { SCAN_STALL_MS } from '../../src/lib/server/services/mapping-state.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { adoptStandard, makeDocument, makePassage } from '../support/documents.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The scan as a job: claimed atomically, read once, never writing into content
 * that changed under it, and never "scanning" forever. The `document-scan` spec.
 */
const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);
const FIXTURES = join(import.meta.dirname, '../fixtures/documents');
const CLAUSE = getStandard('rcos-core', '0.1').countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let uploadDir: string;
let clock: ReturnType<typeof fixedClock>;
let ana: Ctx;
let lena: Ctx;

/** A model that records every passage it is shown, and answers passage 1 of each batch. */
function recordingModel(options: { throwOn?: number; answer?: (n: number) => string } = {}) {
	const asked: string[] = [];
	let calls = 0;
	const provider: AiProvider = {
		id: 'fixture',
		complete: async (request) => {
			calls += 1;
			if (options.throwOn === calls) throw new Error('the provider fell over');
			asked.push(request.input);
			return {
				ok: true,
				text:
					options.answer?.(calls) ??
					JSON.stringify({
						pairs: [
							{ passage: 1, requirement: CLAUSE.ref, confidence: 70, reason: 'Speaks to it.' }
						]
					}),
				usage: { in: 10, out: 10 },
				model: 'test-model'
			};
		}
	};
	setAiProviderForTests(provider);
	return { asked, calls: () => calls };
}

function seatFor(email: string, role: 'steward' | 'member', home: Ctx['community']): Ctx {
	const person = makeUser(db, { email });
	return {
		user: person,
		community: home,
		membership: makeMembership(db, home.id, person.id, { role, isOwner: role === 'steward' }),
		now: () => clock.now()
	};
}

/** A document of `n` paragraphs, as rows. */
function documentOf(ctx: Ctx, n: number) {
	const doc = makeDocument(db, ctx.community.id);
	for (let i = 0; i < n; i++) {
		makePassage(db, doc.id, { page: 1 + Math.floor(i / 10), text: `Paragraph ${i} of the rules.` });
	}
	return doc;
}

const payloadFor = (ctx: Ctx, documentId: string): ScanPayload => {
	const row = db.select().from(document).where(eq(document.id, documentId)).get()!;
	return {
		communityId: ctx.community.id,
		documentId,
		actorId: ctx.user.id,
		generation: row.contentGeneration,
		claim: row.scanClaim ?? ''
	};
};

const docRow = (id: string) => db.select().from(document).where(eq(document.id, id)).get()!;
const scanJobs = () => db.select().from(job).where(eq(job.kind, 'document.scan')).all();

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	uploadDir = mkdtempSync(join(tmpdir(), 'compass-scan-'));
	vi.stubEnv('UPLOAD_DIR', uploadDir);
	vi.stubEnv('AI_PROVIDER', 'fixture');
	resetConfigForTests();
	clock = fixedClock(NOW);

	const home = makeCommunity(db, { slug: 'valle-verde' });
	db.update(community).set({ aiEnabled: true }).where(eq(community.id, home.id)).run();
	adoptStandard(db, home.id);
	const place = { ...home, aiEnabled: true };
	ana = seatFor('ana@example.org', 'steward', place);
	lena = seatFor('lena@example.org', 'member', place);
});

afterEach(() => {
	setDbForTests(null);
	setAiProviderForTests(null);
	vi.unstubAllEnvs();
	resetConfigForTests();
	rmSync(uploadDir, { recursive: true, force: true });
	cleanup();
});

describe('a scan is started by a member, never by an upload', () => {
	it('sends nothing to a model when a document is uploaded and read', async () => {
		const model = recordingModel();
		const file = new File(
			[readFileSync(join(FIXTURES, 'valle-verde-bylaws.pdf'))],
			'valle-verde-bylaws.pdf'
		);
		const created = await createDocument(
			ana,
			{ filename: 'valle-verde-bylaws.pdf', file: await receiveUpload(file, ana.community.id) },
			{ db }
		);
		await runExtraction(db, clock, created.id);

		expect(model.calls()).toBe(0);
		expect(docRow(created.id).scanStatus).toBe('none');
	});

	it('says what it will cost before it starts', () => {
		const doc = documentOf(ana, 42);
		const available = scanAvailability(ana, getDocument(ana, doc.id, { db }), { db });
		expect(available).toEqual({ ok: true, paragraphs: 42, alreadyRead: 0 });
	});

	it('queues one scan when two members start it at once', () => {
		const doc = documentOf(ana, 3);
		expect(startScan(ana, doc.id, { db })).toEqual({ queued: true });
		expect(startScan(lena, doc.id, { db })).toEqual({ queued: false });
		expect(scanJobs()).toHaveLength(1);
		expect(docRow(doc.id).scanActor).toBe(ana.user.id);
	});

	it('does not let a scan on one document block a scan on another', () => {
		const other = makeCommunity(db, { slug: 'elsewhere' });
		db.update(community).set({ aiEnabled: true }).where(eq(community.id, other.id)).run();
		adoptStandard(db, other.id);
		const marco = seatFor('marco@example.org', 'steward', { ...other, aiEnabled: true });

		expect(startScan(ana, documentOf(ana, 2).id, { db }).queued).toBe(true);
		expect(startScan(ana, documentOf(ana, 2).id, { db }).queued).toBe(true);
		expect(startScan(marco, documentOf(marco, 2).id, { db }).queued).toBe(true);
		expect(scanJobs()).toHaveLength(3);
	});

	it('answers for another community-s document as if it does not exist, and queues nothing', () => {
		const doc = documentOf(ana, 2);
		const other = makeCommunity(db, { slug: 'elsewhere' });
		const marco = seatFor('marco@example.org', 'steward', { ...other, aiEnabled: true });

		expect(catchRefusal(() => startScan(marco, doc.id, { db }))?.status).toBe(404);
		expect(scanJobs()).toHaveLength(0);
	});

	it('refuses with the sentence when AI is off for the community', () => {
		const doc = documentOf(ana, 2);
		const off = { ...ana, community: { ...ana.community, aiEnabled: false } };

		const refusal = catchRefusal(() => startScan(off, doc.id, { db }));
		expect(refusal?.status).toBe(409);
		expect(refusal?.message).toMatch(/by hand/);
		expect(scanJobs()).toHaveLength(0);
	});

	it('explains, rather than errors, when the instance has no provider', () => {
		vi.stubEnv('AI_PROVIDER', 'null');
		resetConfigForTests();
		const doc = documentOf(ana, 2);

		const available = scanAvailability(ana, getDocument(ana, doc.id, { db }), { db });
		expect(available.ok).toBe(false);
		expect(!available.ok && available.reason).toMatch(/by hand/);
	});

	it('refuses a scan of an image-only document with the scan sentence', () => {
		const doc = makeDocument(db, ana.community.id, { status: 'reference_only' });
		const available = scanAvailability(ana, getDocument(ana, doc.id, { db }), { db });
		expect(!available.ok && available.reason).toMatch(/looks like a scan/);
	});
});

describe('a scan reads each paragraph once', () => {
	it('keeps what it read when the budget runs out, and continuing sends only the rest', async () => {
		vi.stubEnv('AI_USER_DAILY_TASKS', '3');
		resetConfigForTests();
		const model = recordingModel();
		const doc = documentOf(ana, 50);

		startScan(ana, doc.id, { db });
		const payload = payloadFor(ana, doc.id);
		const outcomes: string[] = [];
		for (let i = 0; i < 6; i++) outcomes.push((await runScanStep(db, clock, payload)).outcome);

		expect(outcomes.slice(0, 4)).toEqual(['continued', 'continued', 'continued', 'stopped']);
		expect(docRow(doc.id).scanStatus).toBe('stopped');
		expect(docRow(doc.id).scanDetail).toMatch(/budget for today/);
		expect(db.select().from(evidence).all()).toHaveLength(3);
		const firstRun = model.asked.join('\n');

		// Tomorrow: a fresh budget, and only unread paragraphs go to the model.
		vi.stubEnv('AI_USER_DAILY_TASKS', '500');
		resetConfigForTests();
		model.asked.length = 0;
		startScan(ana, doc.id, { db });
		const again = payloadFor(ana, doc.id);
		let outcome = 'continued';
		while (outcome === 'continued') outcome = (await runScanStep(db, clock, again)).outcome;

		expect(outcome).toBe('complete');
		for (let i = 0; i < 36; i++) expect(firstRun).toContain(`Paragraph ${i} of the rules.`);
		const secondRun = model.asked.join('\n');
		for (let i = 0; i < 36; i++) expect(secondRun).not.toContain(`Paragraph ${i} of the rules.`);
		expect(secondRun).toContain('Paragraph 49 of the rules.');
	});

	it('never sends a paragraph twice, even one the model said nothing about', async () => {
		const model = recordingModel({ answer: () => '{"pairs":[]}' });
		const doc = documentOf(ana, 5);

		startScan(ana, doc.id, { db });
		// Five paragraphs are one batch, and the batch that reads the last of them
		// ends the scan — no second job just to find nothing left.
		expect((await runScanStep(db, clock, payloadFor(ana, doc.id))).outcome).toBe('complete');
		expect(model.calls()).toBe(1);

		// Start again: nothing is left to read, so there is nothing to start.
		expect(catchRefusal(() => startScan(ana, doc.id, { db }))).toEqual({
			status: 409,
			message: 'Compass has already read every paragraph of this document.'
		});
		expect(model.calls()).toBe(1);
	});
});

describe('a scan never writes into content that changed under it', () => {
	it('stops quietly when the file is replaced between batches', async () => {
		recordingModel();
		const doc = documentOf(ana, 30);
		startScan(ana, doc.id, { db });
		const payload = payloadFor(ana, doc.id);
		await runScanStep(db, clock, payload);
		const before = db.select().from(evidence).all().length;

		// What a replacement does to the rows: new passages, a new generation.
		db.delete(passage).where(eq(passage.documentId, doc.id)).run();
		for (let i = 0; i < 5; i++) makePassage(db, doc.id, { text: `New paragraph ${i}.` });
		db.update(document)
			.set({ contentGeneration: 1, scanStatus: 'none' })
			.where(eq(document.id, doc.id))
			.run();

		expect((await runScanStep(db, clock, payload)).outcome).toBe('superseded');
		expect(db.select().from(evidence).all()).toHaveLength(before);
		const newPassages = db.select().from(passage).where(eq(passage.documentId, doc.id)).all();
		expect(newPassages.every((row) => row.scannedAt === null)).toBe(true);
	});

	it('ends without an error when the document is removed mid-scan', async () => {
		recordingModel();
		const doc = documentOf(ana, 30);
		startScan(ana, doc.id, { db });
		const payload = payloadFor(ana, doc.id);
		await runScanStep(db, clock, payload);

		db.delete(passage).where(eq(passage.documentId, doc.id)).run();
		db.delete(evidence).run();
		db.delete(document).where(eq(document.id, doc.id)).run();

		await expect(runScanJob(db, clock, payload)).resolves.toMatchObject({ outcome: 'gone' });
		expect(scanJobs().filter((row) => row.status === 'pending')).toHaveLength(1);
	});
});

describe('a scan that cannot go on stops visibly', () => {
	it('stops without another call when the member who started it has left', async () => {
		const model = recordingModel();
		const doc = documentOf(lena, 30);
		startScan(lena, doc.id, { db });
		db.update(membership)
			.set({ endedAt: new Date(NOW) })
			.where(eq(membership.id, lena.membership.id))
			.run();

		expect((await runScanStep(db, clock, payloadFor(lena, doc.id))).outcome).toBe('stopped');
		expect(model.calls()).toBe(0);
		expect(docRow(doc.id).scanDetail).toMatch(/can no longer run it/);
		// Nobody is told: the member who would be has left.
		expect(db.select().from(notification).all()).toHaveLength(0);
	});

	it('stops when the community switches AI off mid-scan', async () => {
		recordingModel();
		const doc = documentOf(ana, 30);
		startScan(ana, doc.id, { db });
		const payload = payloadFor(ana, doc.id);
		await runScanStep(db, clock, payload);
		db.update(community).set({ aiEnabled: false }).where(eq(community.id, ana.community.id)).run();

		expect((await runScanStep(db, clock, payload)).outcome).toBe('stopped');
		expect(docRow(doc.id).scanStatus).toBe('stopped');
	});

	it('records an unexpected throw as a stop, and the job resolves rather than retrying', async () => {
		recordingModel({ throwOn: 1 });
		const doc = documentOf(ana, 5);
		startScan(ana, doc.id, { db });

		await expect(runScanJob(db, clock, payloadFor(ana, doc.id))).resolves.toMatchObject({
			outcome: 'stopped'
		});
		expect(docRow(doc.id).scanDetail).toMatch(/stopped unexpectedly/);
	});

	it('lets a stalled scan be claimed again', () => {
		const doc = documentOf(ana, 3);
		startScan(ana, doc.id, { db });
		expect(startScan(lena, doc.id, { db }).queued).toBe(false);

		clock.advance(SCAN_STALL_MS + 1);
		expect(startScan(lena, doc.id, { db }).queued).toBe(true);
		expect(docRow(doc.id).scanActor).toBe(lena.user.id);
	});

	it('supersedes the stalled chain when the same member continues it, so only one chain reads', async () => {
		const model = recordingModel({ answer: () => '{"pairs":[]}' });
		const doc = documentOf(ana, 30);
		startScan(ana, doc.id, { db });
		const stalled = payloadFor(ana, doc.id);

		clock.advance(SCAN_STALL_MS + 1);
		expect(startScan(ana, doc.id, { db }).queued).toBe(true);
		const continued = payloadFor(ana, doc.id);

		expect((await runScanStep(db, clock, stalled)).outcome).toBe('superseded');
		expect(model.calls()).toBe(0);
		expect((await runScanStep(db, clock, continued)).outcome).toBe('continued');
		expect(model.calls()).toBe(1);
	});

	it("forgets the old reading's scan when the document is read again", async () => {
		recordingModel({ answer: () => '{"pairs":[]}' });
		const file = new File(
			[readFileSync(join(FIXTURES, 'valle-verde-bylaws.pdf'))],
			'valle-verde-bylaws.pdf'
		);
		const created = await createDocument(
			ana,
			{ filename: 'valle-verde-bylaws.pdf', file: await receiveUpload(file, ana.community.id) },
			{ db }
		);
		await runExtraction(db, clock, created.id);
		startScan(ana, created.id, { db });
		await runScanStep(db, clock, payloadFor(ana, created.id));
		expect(docRow(created.id).scanStatus).toBe('complete');

		// Read again, the way the boot sweep hands a document back to the reader.
		db.update(document).set({ status: 'uploaded' }).where(eq(document.id, created.id)).run();
		await runExtraction(db, clock, created.id);
		const doc = created;
		expect(docRow(doc.id)).toMatchObject({
			scanStatus: 'none',
			scanActor: null,
			scanClaim: null,
			mappingDoneAt: null
		});
	});
});

describe('the member who started it is told how it ended', () => {
	const toldTo = (ctx: Ctx) =>
		db
			.select()
			.from(notification)
			.where(
				and(
					eq(notification.recipientMembershipId, ctx.membership.id),
					eq(notification.kind, 'document.scan_ended')
				)
			)
			.all();

	it('notifies the actor once on completion, and nobody else', async () => {
		recordingModel();
		const doc = documentOf(ana, 3);
		startScan(ana, doc.id, { db });
		const payload = payloadFor(ana, doc.id);
		while ((await runScanStep(db, clock, payload)).outcome === 'continued');

		expect(toldTo(ana)).toHaveLength(1);
		expect(toldTo(ana)[0]!.summary).toMatch(/finished: 1 passage to review/);
		expect(toldTo(lena)).toHaveLength(0);
	});

	it('notifies the actor once when it stops', async () => {
		vi.stubEnv('AI_USER_DAILY_TASKS', '1');
		resetConfigForTests();
		recordingModel();
		const doc = documentOf(ana, 30);
		startScan(ana, doc.id, { db });
		const payload = payloadFor(ana, doc.id);
		while ((await runScanStep(db, clock, payload)).outcome === 'continued');

		expect(toldTo(ana)).toHaveLength(1);
		expect(toldTo(ana)[0]!.summary).toMatch(/stopped: .*budget/);
	});
});
