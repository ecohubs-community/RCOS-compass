import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
	docxBlocks,
	ExtractionFailed,
	ExtractionUnavailable,
	linesOf,
	odtParagraphs,
	parseInWorker,
	pdfPagePassages,
	withDeadline,
	type RawItem,
	type RawPage
} from '../../src/lib/server/documents/extract.js';
import {
	enqueueRereadIfNeeded,
	rereadBehindDocuments
} from '../../src/lib/server/documents/reread.js';
import { evidence } from '../../src/lib/server/db/schema/documents.js';
import { community, communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { absolutePathOf, receiveUpload } from '../../src/lib/server/documents/storage.js';
import { languageCoverage } from '../../src/lib/server/services/evidence.js';
import { lookup } from '../../src/lib/server/services/lookup.js';
import { docx, odt } from '../../scripts/make-document-fixtures.mjs';
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
		// Ordered by position, with the address the viewer highlights by. Since
		// document-paragraphs a PDF passage carries its line boxes, and each
		// box's character range covers exactly the text it claims to.
		expect(passages[0]!.page).toBe(1);
		for (const p of passages) {
			expect(p.kind).toBe('paragraph');
			const boxes = JSON.parse(p.bbox ?? 'null') as { start: number; end: number }[] | null;
			expect(boxes).not.toBeNull();
			expect(boxes![0]!.start).toBe(0);
			expect(boxes!.at(-1)!.end).toBe(p.text.length);
		}
		// And the reader records which version produced them.
		expect(row.extractorVersion).toBe(2);
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
		// Markdown headings are headings now, and body text is not.
		expect(passages.find((p) => p.text === 'Agreements')?.kind).toBe('heading');
		expect(passages.find((p) => p.text.startsWith('Quiet hours'))?.kind).toBe('paragraph');
	});
});

describe('paragraphs are found from the page geometry', () => {
	/** The passages, with parsed boxes, in document order. */
	const passagesOf = (id: string) =>
		listPassages(ctx, id, { db }).map((p) => ({
			...p,
			boxes: JSON.parse(p.bbox ?? 'null') as
				{ x: number; y: number; start: number; end: number }[] | null
		}));

	it('splits lines with no blank text between them into paragraphs, and joins a hyphenated word', async () => {
		const row = await extractFixture('multi-paragraph-no-blank-lines.pdf');
		const passages = passagesOf(row.id);

		expect(passages.map((p) => [p.kind, p.text])).toEqual([
			['heading', 'Community Agreements'],
			[
				'paragraph',
				'Members of Valle Verde share the common house, the workshop and the orchard, and they keep each of them in good order for whoever comes next.'
			],
			[
				'paragraph',
				'Quiet hours are agreed each season by the housekeeping committee, and posted on the board beside the kitchen.'
			],
			['paragraph', 'Guests are welcome for a week, and longer stays are brought to the assembly.']
		]);

		// The hyphen-joined paragraph still knows which line carries which slice.
		const joined = passages[2]!;
		expect(joined.boxes).toHaveLength(2);
		expect(joined.boxes![0]!.y).toBe(616);
		expect(joined.boxes![1]!.start).toBe(joined.boxes![0]!.end);
		expect(joined.text.slice(joined.boxes![1]!.start)).toBe(
			'tee, and posted on the board beside the kitchen.'
		);
	});

	it('reads the left column before the right', async () => {
		const row = await extractFixture('two-columns.pdf');
		expect(passagesOf(row.id).map((p) => p.text)).toEqual([
			'Left one begins here and runs to a second line.',
			'Left two stands alone.',
			'Right one begins here and runs to its own second line.',
			'Right two stands alone.'
		]);
	});

	it('keeps every table cell, in row order', async () => {
		const row = await extractFixture('headings-and-table.pdf');
		const passages = passagesOf(row.id);

		expect(passages[0]).toMatchObject({ kind: 'heading', text: 'Stewardship' });
		// Structure is a non-goal; losing cells is not. Rows read in order.
		const table = passages.map((p) => p.text).join(' ');
		expect(table).toContain('Orchard Lena 2027');
		expect(table).toContain('Workshop Marco 2026');
		expect(table.indexOf('Orchard')).toBeLessThan(table.indexOf('Workshop'));
	});

	it('stores boxes for a rotated page in unrotated user space', async () => {
		const row = await extractFixture('rotated-page.pdf');
		const passages = passagesOf(row.id);

		expect(passages).toHaveLength(1);
		expect(passages[0]!.text).toBe(
			'This page is displayed turned on its side, and its passage still reads as one paragraph.'
		);
		// The authored baselines, exactly — rotation is the viewer's problem.
		expect(passages[0]!.boxes!.map((b) => b.y)).toEqual([720, 704]);
		expect(passages[0]!.boxes!.map((b) => b.x)).toEqual([72, 72]);
	});

	it('recognises headings in the docx and the odt', async () => {
		// Built with the fixture script's own builders: the committed bylaws
		// fixtures predate heading styles.
		const blocks = [
			{ heading: 'Membership' },
			'New members are admitted by consent of the assembly.'
		];
		for (const [name, bytes] of [
			['with-heading.docx', docx(blocks)],
			['with-heading.odt', odt(blocks)]
		] as const) {
			const file = new File([bytes as BlobPart], name);
			const created = await createDocument(
				ctx,
				{ filename: name, file: await receiveUpload(file, ctx.community.id) },
				{ db }
			);
			await runExtraction(db, clock, created.id);
			const passages = listPassages(ctx, created.id, { db });
			expect(
				passages.map((p) => [p.kind, p.text]),
				name
			).toEqual([
				['heading', 'Membership'],
				['paragraph', 'New members are admitted by consent of the assembly.']
			]);
		}
	});
});

describe('the geometry heuristics, on hand-placed text', () => {
	/** A text run: `[str, x, y, width, fontHeight]`, width estimated from the font. */
	const run = (str: string, x: number, y: number, size = 11): RawItem => [
		str,
		x,
		y,
		str.length * size * 0.5,
		size
	];
	const page = (items: RawItem[]): RawPage => ({ width: 612, height: 792, items });
	const texts = (items: RawItem[]) => pdfPagePassages(page(items)).map((p) => [p.kind, p.text]);

	it('keeps hanging-indented sub-clauses in reading order, not as a second column', () => {
		// Top-level lines at x=72 run across where sub-clauses start at x=108:
		// the starts cluster like columns, but nothing about it is two columns.
		const items = [
			run('4.1 Admission is by consent of the assembly, after a candidacy.', 72, 700),
			run('(a) the candidate lives here for three months first;', 108, 684),
			run('(b) the candidate meets every member at least once.', 108, 668),
			run('4.2 Departure is by written notice to any steward, at any time.', 72, 636),
			run('(a) the share is settled within thirty days;', 108, 620),
			run('(b) tools on loan are returned before the settling.', 108, 604)
		];
		const order = pdfPagePassages(page(items)).map((p) => p.text);
		expect(order.join(' ').indexOf('4.1')).toBeLessThan(
			order.join(' ').indexOf('(a) the candidate')
		);
		expect(order.join(' ').indexOf('(b) the candidate')).toBeLessThan(
			order.join(' ').indexOf('4.2')
		);
	});

	it('reads a two-column page with a narrow gutter as two columns', () => {
		// An 18pt gutter — ordinary for a newsletter — used to be merged into
		// full-width lines before column detection ever saw it.
		const items: RawItem[] = [];
		for (let i = 0; i < 8; i++) {
			items.push([`left line ${i} of the first column`, 72, 700 - i * 14, 216, 11]);
			items.push([`right line ${i} of the second`, 306, 700 - i * 14, 216, 11]);
		}
		const joined = pdfPagePassages(page(items))
			.map((p) => p.text)
			.join(' | ');
		expect(joined.indexOf('left line 7')).toBeLessThan(joined.indexOf('right line 0'));
		expect(joined).not.toMatch(/first column right line/);
	});

	it('calls a heading a heading on a page that is half headings', () => {
		// One heading line and one body line: a line-count median made the
		// heading's own size "body", and the heading a mappable paragraph.
		expect(
			texts([
				run('Membership', 72, 720, 18),
				run('New members are admitted by consent of the assembly, after a candidacy.', 72, 690)
			])
		).toEqual([
			['heading', 'Membership'],
			['paragraph', 'New members are admitted by consent of the assembly, after a candidacy.']
		]);
	});

	it('keeps a superscript footnote marker inside its paragraph', () => {
		expect(
			texts([
				run('A member may leave at any time by telling a steward', 72, 700),
				['1', 72 + 51 * 5.5, 704, 3.5, 7],
				run('in writing, and their share is settled within thirty days.', 72, 684)
			])
		).toEqual([
			[
				'paragraph',
				'A member may leave at any time by telling a steward1 in writing, and their share is settled within thirty days.'
			]
		]);
	});

	it('groups a page of distinct baselines in linear time', () => {
		// Every run on its own baseline is what a hostile or per-glyph producer
		// hands over. This runs on the server's main thread, after the worker.
		const items: RawItem[] = Array.from({ length: 60_000 }, (_, i) => [
			'x',
			72,
			790 - i * 0.013,
			5,
			0.01
		]);
		const started = performance.now();
		linesOf(items);
		expect(performance.now() - started).toBeLessThan(2_000);
	});

	it('keeps each nested Word list item its own passage', () => {
		// Word's multi-level numbering arrives nested; a backreferenced regex
		// ended the outer item at the inner </li> and glued the two together.
		expect(
			docxBlocks(
				'<ol><li>Membership rules for everyone<ol><li>Admission by consent</li><li>Departure by notice</li></ol></li></ol>' +
					'<p>A <strong>bold</strong>word split across runs.</p>'
			)
		).toEqual([
			{ kind: 'paragraph', text: 'Membership rules for everyone' },
			{ kind: 'paragraph', text: 'Admission by consent' },
			{ kind: 'paragraph', text: 'Departure by notice' },
			{ kind: 'paragraph', text: 'A boldword split across runs.' }
		]);
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
		// Work that never finishes, so the deadline is the only thing that can end
		// this. Racing a one-millisecond deadline against a real parse is a coin
		// toss — the first version of this test passed, then failed on a warm
		// module cache, then passed again. The member is told Compass stopped, not
		// handed a stack trace.
		await expect(withDeadline(new Promise(() => {}), 5)).rejects.toMatchObject({
			reason: expect.stringMatching(/took longer than .* seconds, so Compass stopped/)
		});
	});

	it('lets work that finishes in time through untouched', async () => {
		await expect(withDeadline(Promise.resolve('done'), 1_000)).resolves.toBe('done');
	});

	it('leaves no partial passages behind a failure', async () => {
		const row = await extractFixture('hostile.odt');
		const rows = db.select().from(passage).where(eq(passage.documentId, row.id)).all();
		expect(rows).toHaveLength(0);
	});
});

describe('the worker is the enforcement, not a name for one', () => {
	const limits = { maxHeapMb: 32, limits: { maxPages: 5, maxUnzipBytes: 1024 * 1024 } };

	it('terminates a parse that never yields, at the deadline', async () => {
		// A busy loop never lets a raced timer's callback run in-process; only
		// terminating the thread ends it. The injectable code is the point of
		// `parseInWorker`'s last parameter.
		await expect(
			parseInWorker({ path: 'unused', type: 'pdf' }, { deadlineMs: 400, ...limits }, 'for (;;);')
		).rejects.toThrow(/took longer than/);
	});

	it('fails readably when a parse exhausts its heap, and the process survives', async () => {
		// Strings, not Buffers: a Buffer is external memory the old-generation
		// ceiling cannot see, and hoarding those kills the *process* instead of
		// the worker — which is exactly the failure the ceiling exists to stop.
		await expect(
			parseInWorker(
				{ path: 'unused', type: 'pdf' },
				{ deadlineMs: 30_000, ...limits },
				"const hoard = []; for (let i = 0; ; i++) hoard.push(('x' + i).repeat(500_000));"
			)
		).rejects.toThrow(/more memory than Compass allows/);
	});
});

describe('the worker trusts no length in a zip', () => {
	it('refuses an entry whose declared compressed size is larger than the file', async () => {
		// A Buffer lives outside the heap ceiling. Allocating a declared 4 GiB
		// before checking it against the file would OOM the whole server, not the
		// worker; the bound is checked first and the entry is simply unreadable.
		const bytes = odt(['A member may leave at any time by telling a steward.']);
		const directory = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
		// The last central-directory entry is content.xml; +20 is its compressed size.
		bytes.writeUInt32LE(0xfffffff0, directory + 20);
		const path = join(uploadDir, 'lying.odt');
		writeFileSync(path, bytes);

		const raw = await parseInWorker(
			{ path, type: 'odt' },
			{ deadlineMs: 10_000, maxHeapMb: 64, limits: { maxPages: 5, maxUnzipBytes: 1024 * 1024 } }
		);
		expect(raw).toEqual({ kind: 'odt', xml: null });
	});

	it('tells a missing file apart from a damaged one', async () => {
		await expect(
			parseInWorker(
				{ path: join(uploadDir, 'not-there.pdf'), type: 'pdf' },
				{ deadlineMs: 10_000, maxHeapMb: 64, limits: { maxPages: 5, maxUnzipBytes: 1024 } }
			)
		).rejects.toBeInstanceOf(ExtractionUnavailable);
	});
});

describe('every verdict replaces the previous reading', () => {
	/** A document with a reading, one confirmed claim, and search rows. */
	async function readWithClaim(name: string) {
		const row = await extractFixture(name);
		db.insert(communityStandard)
			.values({
				id: 'cs1',
				communityId: ctx.community.id,
				standardId: 'rcos-core',
				version: '0.1',
				status: 'active',
				adoptedAt: new Date(NOW),
				retiredAt: null
			})
			.onConflictDoNothing()
			.run();
		const first = db.select().from(passage).where(eq(passage.documentId, row.id)).all()[0]!;
		db.insert(evidence)
			.values({
				id: `ev-${row.id}`,
				communityId: ctx.community.id,
				passageId: first.id,
				quote: first.text,
				communityStandardId: 'cs1',
				clauseKey: 'c-3.6.2',
				state: 'confirmed',
				confidence: null,
				suggestedBy: 'human',
				confirmedBy: ctx.user.id,
				confirmedAt: new Date(NOW),
				createdAt: new Date(NOW)
			})
			.run();
		return row;
	}

	it('a re-read that fails leaves no old passages, search rows or live claims', async () => {
		const row = await readWithClaim('valle-verde-bylaws.pdf');
		// The file is replaced on disk by something that is not a PDF any more —
		// a parser verdict, not a machine problem.
		writeFileSync(absolutePathOf(row.storageKey), 'not a pdf at all');
		db.update(document).set({ status: 'uploaded' }).where(eq(document.id, row.id)).run();

		await runExtraction(db, clock, row.id);

		const after = db.select().from(document).where(eq(document.id, row.id)).get()!;
		expect(after.status).toBe('failed');
		expect(listPassages(ctx, row.id, { db })).toHaveLength(0);
		expect(
			db
				.select()
				.from(evidence)
				.all()
				.map((e) => e.state)
		).toEqual(['stale']);
		// …and search agrees the old reading is gone.
		expect(
			lookup(ctx, 'steward', { db }).ours.filter((hit) => hit.kind === 'passage')
		).toHaveLength(0);
	});

	it('a re-read that finds a scan leaves no old passages either', async () => {
		const row = await readWithClaim('valle-verde-bylaws.pdf');
		writeFileSync(
			absolutePathOf(row.storageKey),
			readFileSync(join(FIXTURES, 'scanned-minutes.pdf'))
		);
		db.update(document).set({ status: 'uploaded' }).where(eq(document.id, row.id)).run();

		await runExtraction(db, clock, row.id);

		expect(db.select().from(document).where(eq(document.id, row.id)).get()!.status).toBe(
			'reference_only'
		);
		expect(listPassages(ctx, row.id, { db })).toHaveLength(0);
		expect(
			db
				.select()
				.from(evidence)
				.all()
				.map((e) => e.state)
		).toEqual(['stale']);
	});

	it('a re-read that cannot be attempted keeps the earlier reading and retries later', async () => {
		const row = await readWithClaim('valle-verde-bylaws.pdf');
		const before = listPassages(ctx, row.id, { db }).map((p) => p.id);
		// The upload volume is not there — a fact about the machine.
		rmSync(absolutePathOf(row.storageKey));
		db.update(document)
			.set({ status: 'uploaded', extractorVersion: null })
			.where(eq(document.id, row.id))
			.run();

		await runExtraction(db, clock, row.id);

		const after = db.select().from(document).where(eq(document.id, row.id)).get()!;
		expect(after.status).toBe('extracted');
		// Not stamped: the next boot's sweep tries again.
		expect(after.extractorVersion).toBeNull();
		expect(listPassages(ctx, row.id, { db }).map((p) => p.id)).toEqual(before);
		expect(
			db
				.select()
				.from(evidence)
				.all()
				.map((e) => e.state)
		).toEqual(['confirmed']);
	});

	it('a first upload that cannot be attempted is not called damaged', async () => {
		const file = new File([readFileSync(join(FIXTURES, 'valle-verde-bylaws.pdf'))], 'b.pdf');
		const created = await createDocument(
			ctx,
			{ filename: 'b.pdf', file: await receiveUpload(file, ctx.community.id) },
			{ db }
		);
		rmSync(absolutePathOf(created.storageKey));

		await runExtraction(db, clock, created.id);

		const after = db.select().from(document).where(eq(document.id, created.id)).get()!;
		expect(after.status).toBe('failed');
		expect(after.statusDetail).toMatch(/will try again/);
		expect(after.statusDetail).not.toMatch(/damaged/);
		expect(after.extractorVersion).toBeNull();
	});
});

describe('documents read by an older reader are read again', () => {
	it('re-reads at boot, stales the evidence, and leaves current documents alone', async () => {
		const row = await extractFixture('valle-verde-bylaws.pdf');
		const current = await extractFixture('injection.pdf');

		// A claim against one of its passages, made under the old reader.
		db.insert(communityStandard)
			.values({
				id: 'cs1',
				communityId: ctx.community.id,
				standardId: 'rcos-core',
				version: '0.1',
				status: 'active',
				adoptedAt: new Date(NOW),
				retiredAt: null
			})
			.run();
		const first = db.select().from(passage).where(eq(passage.documentId, row.id)).all()[0]!;
		db.insert(evidence)
			.values({
				id: 'ev1',
				communityId: ctx.community.id,
				passageId: first.id,
				quote: first.text,
				communityStandardId: 'cs1',
				clauseKey: 'c-3.6.2',
				state: 'confirmed',
				confidence: null,
				suggestedBy: 'human',
				confirmedBy: ctx.user.id,
				confirmedAt: new Date(NOW),
				createdAt: new Date(NOW)
			})
			.run();

		// The bylaws came from the old reader; the other document is current.
		db.update(document).set({ extractorVersion: null }).where(eq(document.id, row.id)).run();

		expect(enqueueRereadIfNeeded(db, clock)).not.toBeNull();
		// Drain the queue — the uploads' own extract jobs, the sweep, and the
		// extraction the sweep enqueues — the way the worker would.
		for (let i = 0; i < 4; i++) await runOnce(db, handlers, { clock });

		const reread = db.select().from(document).where(eq(document.id, row.id)).get()!;
		expect(reread.status).toBe('extracted');
		expect(reread.extractorVersion).toBe(2);
		// New passages exist; the old claim survives, stale and still readable.
		expect(
			db.select().from(passage).where(eq(passage.documentId, row.id)).all().length
		).toBeGreaterThan(0);
		const claim = db.select().from(evidence).all()[0]!;
		expect(claim.state).toBe('stale');
		expect(claim.quote).toBe(first.text);

		// The current document was not touched, and a second boot enqueues nothing.
		const untouched = db.select().from(document).where(eq(document.id, current.id)).get()!;
		expect(untouched.status).toBe('extracted');
		expect(enqueueRereadIfNeeded(db, clock)).toBeNull();

		// The dashboard's coverage line follows the staling honestly: the claim
		// no longer counts, and nothing errors while it is being re-earned.
		expect(languageCoverage(ctx, { db }).have).toBe(0);
	});

	it('leaves a suspended community alone', async () => {
		// Suspended is read-only by decision; a re-read stales evidence, which is
		// a write that community never agreed to.
		const row = await extractFixture('valle-verde-bylaws.pdf');
		db.update(document).set({ extractorVersion: null }).where(eq(document.id, row.id)).run();
		db.update(community)
			.set({ status: 'suspended' })
			.where(eq(community.id, ctx.community.id))
			.run();

		expect(enqueueRereadIfNeeded(db, clock)).toBeNull();
		expect(rereadBehindDocuments(db, clock).rereading).toBe(0);
		expect(db.select().from(document).where(eq(document.id, row.id)).get()!.status).toBe(
			'extracted'
		);
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

describe('a document is text, never markup', () => {
	it('keeps a script tag in a Word document as words', async () => {
		// mammoth escapes it into its HTML; docxBlocks strips tags *before*
		// decoding entities, so the payload comes out as literal text — words a
		// member wrote, however unwise — and never as an element.
		const bytes = docx(['Quiet hours apply.', '&lt;script&gt;alert(1)&lt;/script&gt; stays text.']);
		const file = new File([bytes as unknown as BlobPart], 'hostile.docx');
		const created = await createDocument(
			ctx,
			{ filename: 'hostile.docx', file: await receiveUpload(file, ctx.community.id) },
			{ db }
		);
		await runExtraction(db, clock, created.id);

		const texts = listPassages(ctx, created.id, { db }).map((p) => p.text);
		expect(texts).toContain('<script>alert(1)</script> stays text.');
	});

	it('keeps a payload as words all the way to the node tree', async () => {
		// Document text is the most hostile text in the product: it did not even
		// come from a member typing into a form. It goes through the same parser
		// as everything else, which has no HTML sink for a payload to reach.
		const { parseMarkdown } = await import('../../src/lib/server/markdown.js');
		const file = new File(
			[
				'Quiet hours apply.\n\n<img src=x onerror="alert(1)">\n\n' +
					'[click me](javascript:alert(1)) and <script>alert(2)</script>\n'
			],
			'hostile.md'
		);
		const created = await createDocument(
			ctx,
			{ filename: 'hostile.md', file: await receiveUpload(file, ctx.community.id) },
			{ db }
		);
		await runExtraction(db, clock, created.id);

		const nodes = listPassages(ctx, created.id, { db }).flatMap((row) => parseMarkdown(row.text));
		const flat = JSON.stringify(nodes);

		// No node type carries raw markup, and the dangerous href never became one.
		expect(flat).not.toMatch(/"type":"html"/);
		expect(flat).not.toMatch(/javascript:/);
		// The words themselves survive — a member's text disappearing is its own bug.
		expect(flat).toContain('onerror');
		expect(flat).toContain('click me');
	});
});
