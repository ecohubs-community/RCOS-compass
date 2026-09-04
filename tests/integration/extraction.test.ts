import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { fixedClock } from '../../src/lib/server/clock.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { document, passage } from '../../src/lib/server/db/schema/documents.js';
import { runExtraction } from '../../src/lib/server/documents/extract-job.js';
import {
	extract,
	ExtractionFailed,
	odtParagraphs
} from '../../src/lib/server/documents/extract.js';
import { receiveUpload } from '../../src/lib/server/documents/storage.js';
import { claim, deadLetters } from '../../src/lib/server/jobs/queue.js';
import { runOnce } from '../../src/lib/server/jobs/worker.js';
import { handlers } from '../../src/lib/server/jobs/handlers.js';
import { createDocument, listPassages } from '../../src/lib/server/services/documents.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * Extraction, on the real fixtures, through the real job.
 * docs/06-testing-strategy.md §6.8, and the change's `documents` spec.
 *
 * The vocabulary under test is the status column: `extracted` for what could be
 * read, `reference_only` for a scan — a success, said plainly — and `failed`
 * with a reason a member can act on. What must never exist afterwards is a
 * document whose row claims text it does not have, or holds a prefix of it.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const FIXTURES = join(import.meta.dirname, '../fixtures/documents');

let db: Db;
let cleanup: () => void;
let uploadDir: string;
let ctx: Ctx;
const clock = fixedClock(NOW);

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	uploadDir = mkdtempSync(join(tmpdir(), 'compass-extract-'));
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
});

afterEach(() => {
	setDbForTests(null);
	vi.unstubAllEnvs();
	resetConfigForTests();
	rmSync(uploadDir, { recursive: true, force: true });
	cleanup();
});

/** Upload a fixture and run its extraction, the way the worker would. */
async function extractFixture(name: string) {
	const file = new File([readFileSync(join(FIXTURES, name))], name);
	const created = await createDocument(
		ctx,
		{ filename: name, file: await receiveUpload(file, ctx.community.id) },
		{ db }
	);
	await runExtraction(db, clock, created.id);
	return db.select().from(document).where(eq(document.id, created.id)).get()!;
}

describe('what each kind of document becomes', () => {
	it('extracts the bylaws PDF into the passages a member will map', async () => {
		const row = await extractFixture('valle-verde-bylaws.pdf');

		expect(row.status).toBe('extracted');
		expect(row.pagesExtracted).toBe(5);
		expect(row.pagesTotal).toBe(5);
		expect(row.statusDetail).toBeNull();

		const passages = listPassages(ctx, row.id, { db });
		expect(passages.length).toBeGreaterThanOrEqual(5);
		// The community's own sentence, verbatim — the one the loop spec maps.
		expect(passages.map((p) => p.text).join(' ')).toContain(
			'A member may leave at any time by telling a steward'
		);
		// Ordered by position, with the address the viewer highlights by.
		expect(passages[0]!.page).toBe(1);
		expect(passages.every((p) => p.bbox === null)).toBe(true);
	});

	it('extracts the same words from the docx and the odt', async () => {
		for (const name of ['valle-verde-bylaws.docx', 'valle-verde-bylaws.odt']) {
			const row = await extractFixture(name);
			expect(row.status, name).toBe('extracted');
			const text = listPassages(ctx, row.id, { db })
				.map((p) => p.text)
				.join(' ');
			expect(text, name).toContain('A member may leave at any time');
			expect(text, name).toContain('Treasury balances are published');
		}
	});

	it('extracts markdown and plain text', async () => {
		const file = new File(
			['# Agreements\n\nQuiet hours start at 22:00.\n\nGuests are welcome for a week.\n'],
			'agreements.md'
		);
		const created = await createDocument(
			ctx,
			{ filename: 'agreements.md', file: await receiveUpload(file, ctx.community.id) },
			{ db }
		);
		await runExtraction(db, clock, created.id);

		const passages = listPassages(ctx, created.id, { db });
		expect(passages.map((p) => p.text)).toContain('Quiet hours start at 22:00.');
	});
});

describe('a scan is a scan, said plainly', () => {
	it('keeps the file and says Compass cannot read it', async () => {
		const row = await extractFixture('scanned-minutes.pdf');

		// A success state, not a failure: the community did nothing wrong.
		expect(row.status).toBe('reference_only');
		expect(row.statusDetail).toMatch(/looks like a scan/i);
		expect(listPassages(ctx, row.id, { db })).toHaveLength(0);
	});
});

describe('the page ceiling reports what it did not read', () => {
	it('extracts up to the limit and says the rest was not read', async () => {
		const row = await extractFixture('four-hundred-pages.pdf');

		expect(row.status).toBe('extracted');
		expect(row.pagesExtracted).toBe(300);
		expect(row.pagesTotal).toBe(400);
		expect(row.statusDetail).toMatch(/300 of 400 pages/);

		const passages = listPassages(ctx, row.id, { db });
		expect(Math.max(...passages.map((p) => p.page))).toBe(300);
	});
});

describe('a hostile document fails, visibly and completely', () => {
	it('refuses the billion-laughs odt without expanding anything', async () => {
		const row = await extractFixture('hostile.odt');

		expect(row.status).toBe('failed');
		expect(row.statusDetail).toMatch(/custom XML entities/i);
		expect(listPassages(ctx, row.id, { db })).toHaveLength(0);
	});

	it('refuses a DOCTYPE at the parser itself', () => {
		// The unit-level half: the reader refuses before any expansion, so the
		// cost of the attack is the cost of a regex over 400 bytes.
		expect(() => odtParagraphs('<!DOCTYPE x [<!ENTITY a "boom">]><text:p>&a;</text:p>')).toThrow(
			ExtractionFailed
		);
	});

	it('stops at the deadline, with a message about the deadline', async () => {
		// One millisecond is not enough to read four hundred pages; the member is
		// told Compass stopped, not handed a stack trace.
		await expect(extract(join(FIXTURES, 'four-hundred-pages.pdf'), 'pdf', 1)).rejects.toMatchObject(
			{ reason: expect.stringMatching(/took longer|stopped/) }
		);
	});

	it('leaves no partial passages behind a failure', async () => {
		const row = await extractFixture('hostile.odt');
		const rows = db.select().from(passage).where(eq(passage.documentId, row.id)).all();
		expect(rows).toHaveLength(0);
	});
});

describe('the job around it', () => {
	it('is enqueued by the upload and runs through the worker', async () => {
		const file = new File([readFileSync(join(FIXTURES, 'valle-verde-bylaws.pdf'))], 'b.pdf');
		const created = await createDocument(
			ctx,
			{ filename: 'b.pdf', file: await receiveUpload(file, ctx.community.id) },
			{ db }
		);

		// The row waits; the queue holds the work; the worker does it.
		expect(created.status).toBe('uploaded');
		await runOnce(db, handlers, { clock });

		const after = db.select().from(document).where(eq(document.id, created.id)).get()!;
		expect(after.status).toBe('extracted');
	});

	it('does nothing on a re-claimed run of a finished document', async () => {
		const row = await extractFixture('valle-verde-bylaws.pdf');
		const before = listPassages(ctx, row.id, { db }).map((p) => p.id);

		// At-least-once delivery: the same job runs again.
		await runExtraction(db, clock, row.id);

		expect(listPassages(ctx, row.id, { db }).map((p) => p.id)).toEqual(before);
	});

	it('completes as a no-op when the document is gone', async () => {
		await expect(runExtraction(db, clock, 'no-such-document')).resolves.toBeUndefined();
	});

	it('never leaves the job dead-lettered for a bad document', async () => {
		// A hostile file fails the *document*, not the job: retrying a scan five
		// times produces a scan five times, and a dead letter is where the failure
		// would become invisible to the member who uploaded it.
		const file = new File([readFileSync(join(FIXTURES, 'hostile.odt'))], 'hostile.odt');
		const created = await createDocument(
			ctx,
			{ filename: 'hostile.odt', file: await receiveUpload(file, ctx.community.id) },
			{ db }
		);
		const result = await runOnce(db, handlers, { clock });
		expect(result.failed).toBe(0);

		const after = db.select().from(document).where(eq(document.id, created.id)).get()!;
		expect(after.status).toBe('failed');
		expect(claim(db, clock)).toHaveLength(0);
		expect(deadLetters(db)).toHaveLength(0);
	});
});
