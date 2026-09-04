import { readFileSync } from 'node:fs';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { document } from '../../src/lib/server/db/schema/documents.js';
import {
	absolutePathOf,
	receiveUpload,
	UploadRefused
} from '../../src/lib/server/documents/storage.js';
import {
	createDocument,
	deleteDocument,
	getDocument,
	listDocuments
} from '../../src/lib/server/services/documents.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal, catchRefusalAsync } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * The upload envelope. docs/04-security.md §5.1, docs/06-testing-strategy.md §6.8.
 *
 * Every case here is a real fixture pushed through the real path, because the
 * property under test is not "the check exists" but "the check fires and leaves
 * nothing behind". A rejection that stores the file anyway passes a unit test of
 * the validator and fails the only thing that matters.
 */
const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);
const FIXTURES = join(import.meta.dirname, '../fixtures/documents');

/**
 * Configuration comes from the environment and is cached, so a test that wants a
 * different ceiling sets the variable and drops the cache — the same path the
 * application uses, rather than a seam only tests can reach.
 */
function configure(values: Record<string, string>) {
	for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
	resetConfigForTests();
}

let db: Db;
let cleanup: () => void;
let uploadDir: string;
let ctx: Ctx;
let memberCtx: Ctx;

/** A `File` from a fixture on disk — the same shape a form action receives. */
function fixtureFile(name: string): File {
	return new File([readFileSync(join(FIXTURES, name))], name);
}

const upload = async (who: Ctx, name: string) =>
	createDocument(
		who,
		{ filename: name, file: await receiveUpload(fixtureFile(name), who.community.id) },
		{ db }
	);

beforeEach(() => {
	({ db, cleanup } = createTestDb());
	setDbForTests(db);
	uploadDir = mkdtempSync(join(tmpdir(), 'compass-uploads-'));
	configure({ UPLOAD_DIR: uploadDir });

	const community = makeCommunity(db, { slug: 'valle-verde' });
	const steward = makeUser(db, { email: 'ana@example.org' });
	ctx = {
		user: steward,
		community,
		membership: makeMembership(db, community.id, steward.id, { role: 'steward', isOwner: true }),
		now: () => NOW
	};
	const person = makeUser(db, { email: 'lena@example.org' });
	memberCtx = {
		...ctx,
		user: person,
		membership: makeMembership(db, community.id, person.id, { role: 'member' })
	};
});

afterEach(() => {
	setDbForTests(null);
	vi.unstubAllEnvs();
	resetConfigForTests();
	rmSync(uploadDir, { recursive: true, force: true });
	cleanup();
});

/** Nothing kept: no row, and nothing under the upload directory but the temp dir. */
function nothingKept() {
	expect(db.select().from(document).all()).toHaveLength(0);
	expect(existsSync(join(uploadDir, ctx.community.id))).toBe(false);
}

describe('a document a community can actually use', () => {
	it('accepts bylaws and stores them under the community', async () => {
		const stored = await upload(ctx, 'valle-verde-bylaws.pdf');

		expect(stored.status).toBe('uploaded');
		expect(stored.mime).toBe('application/pdf');
		expect(stored.sha256).toHaveLength(64);
		expect(existsSync(absolutePathOf(stored.storageKey))).toBe(true);
	});

	it('accepts the formats RCOS itself publishes in', async () => {
		for (const name of ['valle-verde-bylaws.docx', 'valle-verde-bylaws.odt']) {
			const stored = await upload(ctx, name);
			expect(stored.status).toBe('uploaded');
		}
		expect(listDocuments(ctx, { db })).toHaveLength(2);
	});

	it('lets a member upload, and only a steward delete', async () => {
		// A member may do everything that produces a proposal. Removing a document
		// invalidates other people's confirmed evidence, so it is a steward's act.
		const stored = await upload(memberCtx, 'valle-verde-bylaws.pdf');
		expect(
			(await catchRefusalAsync(() => deleteDocument(memberCtx, stored.id, { db })))?.status
		).toBe(403);

		await deleteDocument(ctx, stored.id, { db });
		expect(listDocuments(ctx, { db })).toHaveLength(0);
		expect(existsSync(absolutePathOf(stored.storageKey))).toBe(false);
	});
});

describe('a slow connection is still a valid upload', () => {
	/** A file whose stream arrives in pieces, the way a real network delivers one. */
	function trickled(name: string, size: number) {
		const bytes = readFileSync(join(FIXTURES, name));
		return {
			name,
			stream: () =>
				new ReadableStream<Uint8Array>({
					start(controller) {
						for (let at = 0; at < bytes.length; at += size) {
							controller.enqueue(new Uint8Array(bytes.subarray(at, at + size)));
						}
						controller.close();
					}
				})
		};
	}

	it.each([64, 512, 4096, 65536])('identifies a docx arriving in %i-byte pieces', async (size) => {
		// The format decision has to be made on the sniff *window*, not on
		// whatever the first chunk happened to contain. At 64 bytes the first
		// chunk of a docx has not reached `word/document.xml` yet, and an earlier
		// version refused the file as "an archive of some other kind" — the same
		// document accepted over a fast connection and rejected over a slow one.
		const stored = await receiveUpload(trickled('valle-verde-bylaws.docx', size), ctx.community.id);
		expect(stored.type).toBe('docx');
	});

	it('identifies a file smaller than the sniff window', async () => {
		const stored = await receiveUpload(
			new File(['Minutes of the assembly.\n'], 'notes.txt'),
			ctx.community.id
		);
		expect(stored.type).toBe('txt');
	});
});

describe('the tenant boundary', () => {
	it('answers for another community-s document as if it does not exist', async () => {
		const stored = await upload(ctx, 'valle-verde-bylaws.pdf');

		const other = makeCommunity(db, { slug: 'other-place' });
		const person = makeUser(db, { email: 'marco@example.org' });
		const theirCtx: Ctx = {
			user: person,
			community: other,
			membership: makeMembership(db, other.id, person.id, { role: 'steward', isOwner: true }),
			now: () => NOW
		};

		// A steward of B, with A's real document id. 404, not 403: they do not get
		// to learn that a document exists.
		expect(catchRefusal(() => getDocument(theirCtx, stored.id, { db }))?.status).toBe(404);
		expect(
			(await catchRefusalAsync(() => deleteDocument(theirCtx, stored.id, { db })))?.status
		).toBe(404);
		// And it is still there.
		expect(existsSync(absolutePathOf(stored.storageKey))).toBe(true);
	});
});

describe('every rejection leaves nothing behind', () => {
	const refuse = async (name: string) => {
		let reason = '';
		try {
			await upload(ctx, name);
		} catch (problem) {
			reason = problem instanceof UploadRefused ? problem.reason : String(problem);
		}
		expect(reason, `${name} was not refused`).not.toBe('');
		nothingKept();
		return reason;
	};

	it('refuses an executable wearing a PDF name', async () => {
		// The whole reason a sniffed type has to agree with the extension: an
		// upload form that trusts the name is a way to store arbitrary binaries on
		// a domain members trust.
		expect(await refuse('not-really.pdf')).toMatch(/name and contents disagree/i);
	});

	it('refuses a zip bomb without unpacking it', async () => {
		// 219 KB on disk, 220 MB unpacked. Sniffing accepts it, correctly — it is
		// structurally a docx. What refuses it is what the archive says it will
		// become, read from its own central directory.
		expect(await refuse('zip-bomb.docx')).toMatch(/unpacks to 220 MB/);
	});

	it('refuses a file larger than the ceiling, part way through reading it', async () => {
		configure({ MAX_UPLOAD_MB: '1' });

		// Two megabytes of perfectly valid text. The refusal has to come from the
		// ceiling being passed mid-stream, not from anything about the content.
		let reason = '';
		try {
			await receiveUpload(new File(['word '.repeat(420_000)], 'long.txt'), ctx.community.id);
		} catch (problem) {
			reason = (problem as UploadRefused).reason;
		}
		expect(reason).toMatch(/larger than 1 MB/);
		nothingKept();
	});

	it('refuses a type that is not on the list', async () => {
		let reason = '';
		try {
			await receiveUpload(new File(['#!/bin/sh\necho hi\n'], 'run.sh'), ctx.community.id);
		} catch (problem) {
			reason = (problem as UploadRefused).reason;
		}
		expect(reason).toMatch(/not one of those/i);
		nothingKept();
	});

	it('refuses an empty file', async () => {
		let reason = '';
		try {
			await receiveUpload(new File([], 'nothing.txt'), ctx.community.id);
		} catch (problem) {
			reason = (problem as UploadRefused).reason;
		}
		expect(reason).toMatch(/empty/i);
		nothingKept();
	});
});

describe('limits refuse, and say which limit it was', () => {
	it('stops one member after their hourly allowance', async () => {
		configure({ UPLOAD_PER_USER_HOUR: '2' });

		await upload(memberCtx, 'valle-verde-bylaws.pdf');
		await upload(memberCtx, 'valle-verde-bylaws.docx');

		const refusal = await catchRefusalAsync(() => upload(memberCtx, 'valle-verde-bylaws.odt'));
		expect(refusal?.status).toBe(409);
		expect(refusal?.message).toMatch(/in the last hour/);

		// And it is *their* allowance: the community is not stopped with them.
		await expect(upload(ctx, 'valle-verde-bylaws.odt')).resolves.toBeTruthy();
	});

	it('stops the community at its storage ceiling', async () => {
		configure({ STORAGE_MB: '1' });

		const big = async (name: string) =>
			createDocument(
				ctx,
				{
					filename: name,
					file: await receiveUpload(new File(['word '.repeat(180_000)], name), ctx.community.id)
				},
				{ db }
			);

		await big('first.txt');
		const refusal = await catchRefusalAsync(() => big('second.txt'));
		expect(refusal?.status).toBe(409);
		expect(refusal?.message).toMatch(/storing 1 MB/);
		// The one that fitted is still there; the one that did not left nothing.
		expect(listDocuments(ctx, { db })).toHaveLength(1);
	});

	it('refuses while the community is suspended', async () => {
		const suspended: Ctx = {
			...ctx,
			community: { ...ctx.community, status: 'suspended', suspendedReason: 'Non-payment.' }
		};
		const refusal = await catchRefusalAsync(() => upload(suspended, 'valle-verde-bylaws.pdf'));
		expect(refusal?.status).toBe(409);
		nothingKept();
	});
});
