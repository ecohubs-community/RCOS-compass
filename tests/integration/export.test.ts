import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { asSignedIn } from '../../src/lib/server/auth/audience.js';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { runExport } from '../../src/lib/server/jobs/export-job.js';
import { absolutePathOf } from '../../src/lib/server/documents/storage.js';
import { listDecisions } from '../../src/lib/server/services/decisions.js';
import {
	buildBundle,
	listExports,
	signDownload,
	verifyDownload,
	EXPORT_LINK_TTL_MS,
	type BundleManifest
} from '../../src/lib/server/services/export.js';
import { restrict } from '../../src/lib/server/services/visibility.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * "Take everything and leave." `docs/10-legal-and-operations.md` §1.3.
 *
 * This is deliberately **not** an e2e test. "Readable without the app" cannot be
 * demonstrated by a suite whose web server is running — the only honest check
 * is to take the produced file and read it with nothing serving, which is what
 * happens below. The e2e spec asks for the export and follows the link; this
 * asserts the artefact.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let standardRowId: string;

function adopt(
	overrides: Partial<typeof definition.$inferInsert> = {},
	body = 'Members may leave at any time.'
): string {
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
});

afterEach(() => {
	vi.unstubAllEnvs();
	resetConfigForTests();
	setDbForTests(null);
	cleanup();
});

const openBundle = (bytes: Uint8Array) => {
	const entries = unzipSync(bytes);
	return {
		names: Object.keys(entries).sort(),
		text: (path: string) => strFromU8(entries[path]!),
		manifest: JSON.parse(strFromU8(entries['manifest.json']!)) as BundleManifest
	};
};

describe('the bundle is readable with nothing running', () => {
	it('unpacks into documents a person can read', async () => {
		adopt();
		// Through the job, so what is asserted is the file that would actually be
		// downloaded rather than a convenient in-memory value.
		await runExport(db, { communityId: ana.community.id, actorId: ana.user.id }, NOW);

		const [file] = listExports(ana, { db });
		const bytes = await readFile(absolutePathOf(file!.storageKey));
		const bundle = openBundle(new Uint8Array(bytes));

		// Somebody who has never seen Compass opens this first.
		expect(bundle.names).toContain('README.md');
		expect(bundle.text('README.md')).toContain('You do not need any particular');
		expect(bundle.names).toContain('manifest.json');
		expect(bundle.names).toContain('decisions.md');
		expect(bundle.names).toContain('decisions.json');
		expect(bundle.names.some((name) => name.startsWith('artifacts/'))).toBe(true);
	});

	it('agrees with the register', async () => {
		adopt();
		await runExport(db, { communityId: ana.community.id, actorId: ana.user.id }, NOW);
		const [file] = listExports(ana, { db });
		const bundle = openBundle(new Uint8Array(await readFile(absolutePathOf(file!.storageKey))));

		// A bundle that says something different from the product it came out of
		// is worse than no bundle: it is a document somebody would cite.
		expect(bundle.manifest.counts.decisions).toBe(listDecisions(ana, { db }).length);
		expect(JSON.parse(bundle.text('decisions.json'))).toHaveLength(
			bundle.manifest.counts.decisions
		);
	});

	it('carries the community text, not a description of it', () => {
		adopt({}, 'Any spend over €500 needs a consent decision of the whole circle.');
		const built = buildBundle(db, asSignedIn(ana), NOW);
		const bundle = openBundle(built.bytes);

		const artifactFile = bundle.names.find((name) => name.startsWith('artifacts/'))!;
		const everything = bundle.names.map((name) => bundle.text(name)).join('\n');
		expect(everything).toContain('Any spend over €500 needs a consent decision');
		expect(bundle.text(artifactFile)).toBeTruthy();
	});

	it('needs no network to make sense', () => {
		adopt();
		const bundle = openBundle(buildBundle(db, asSignedIn(ana), NOW).bytes);
		const everything = bundle.names.map((name) => bundle.text(name)).join('\n');

		// No link back into the app: a bundle whose content is behind a URL is not
		// an export, it is a bookmark.
		expect(everything).not.toMatch(/https?:\/\/localhost/);
		expect(everything).not.toMatch(/\/c\/valle-verde\//);
	});
});

describe('a bundle carries only what its requester could see', () => {
	it('leaves out what the exporter may not read, and says so', () => {
		const hidden = adopt({}, 'A sentence only the stewards may read.');
		const other = makeUser(db, { email: 'lena@example.org' });
		const lena = {
			...ana,
			user: other,
			membership: makeMembership(db, ana.community.id, other.id, { role: 'member' })
		} as Ctx;

		restrict(
			ana,
			{ type: 'definition', id: hidden },
			{
				justification: 'Asked for by the member it concerns.',
				audience: 'stewards',
				expiresAt: new Date(NOW + 86_400_000)
			},
			{ db }
		);

		const bundle = openBundle(buildBundle(db, asSignedIn(lena), NOW).bytes);
		const everything = bundle.names.map((name) => bundle.text(name)).join('\n');

		expect(everything).not.toContain('only the stewards may read');
		// A bundle that quietly omits something is worse than one that says what
		// it left out.
		expect(bundle.manifest.visibilityLevels).toEqual(['member', 'world']);
	});

	it('includes it for somebody who may', () => {
		const hidden = adopt({}, 'A sentence only the stewards may read.');
		restrict(
			ana,
			{ type: 'definition', id: hidden },
			{
				justification: 'Asked for by the member it concerns.',
				audience: 'stewards',
				expiresAt: new Date(NOW + 86_400_000)
			},
			{ db }
		);

		const bundle = openBundle(buildBundle(db, asSignedIn(ana), NOW).bytes);
		expect(bundle.manifest.visibilityLevels).toContain('restricted');
	});
});

describe('the download link', () => {
	it('round-trips, and expires', () => {
		const token = signDownload('file-1', NOW + EXPORT_LINK_TTL_MS);
		expect(verifyDownload(token, NOW)?.fileId).toBe('file-1');
		expect(verifyDownload(token, NOW + EXPORT_LINK_TTL_MS + 1)).toBeNull();
	});

	it('refuses an altered one', () => {
		const token = signDownload('file-1', NOW + EXPORT_LINK_TTL_MS);

		// Every part of it: the id, the expiry and the signature.
		const [id, expiry, mac] = token.split('.');
		expect(verifyDownload(`file-2.${expiry}.${mac}`, NOW)).toBeNull();
		expect(verifyDownload(`${id}.${NOW + 86_400_000}.${mac}`, NOW)).toBeNull();
		expect(verifyDownload(`${id}.${expiry}.${mac!.slice(0, -2)}xx`, NOW)).toBeNull();
		expect(verifyDownload('nonsense', NOW)).toBeNull();
	});

	it('is bound to this instance', () => {
		const token = signDownload('file-1', NOW + EXPORT_LINK_TTL_MS);
		expect(verifyDownload(token, NOW)).not.toBeNull();

		// A link minted on one instance must not open a bundle on another. The
		// signing key is derived from the instance's own secret, so rotating it
		// invalidates outstanding links — which is the correct direction for
		// something that lives an hour.
		vi.stubEnv('BETTER_AUTH_SECRET', 'a-different-secret-that-is-long-enough');
		resetConfigForTests();
		expect(verifyDownload(token, NOW)).toBeNull();
	});
});

describe('the printable copy is optional, and the bundle says which', () => {
	it('records that it is absent when no browser is available', () => {
		adopt();
		// `buildBundle` is given no PDF, which is what happens on an instance with
		// no headless browser installed. The bundle is complete without it.
		const bundle = openBundle(buildBundle(db, asSignedIn(ana), NOW).bytes);

		expect(bundle.manifest.pdf).toBe('unavailable on this instance');
		expect(bundle.names).not.toContain('governance.pdf');
		// The promise is the Markdown and the JSON, and both are there.
		expect(bundle.names).toContain('decisions.md');
		expect(bundle.names).toContain('decisions.json');
	});

	it('records that it is included when there is one', () => {
		adopt();
		const bundle = openBundle(
			buildBundle(db, asSignedIn(ana), NOW, { pdf: new Uint8Array([37, 80, 68, 70]) }).bytes
		);

		expect(bundle.manifest.pdf).toBe('included');
		expect(bundle.names).toContain('governance.pdf');
		expect(bundle.manifest.files).toContain('manifest.json');
	});
});
