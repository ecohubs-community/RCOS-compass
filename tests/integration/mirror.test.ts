import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { resetConfigForTests } from '../../src/lib/server/config.js';
import { seal, unseal } from '../../src/lib/server/crypto/sealed.js';
import { newId } from '../../src/lib/server/db/id.js';
import { setDbForTests, type Db } from '../../src/lib/server/db/index.js';
import { definition, definitionVersion } from '../../src/lib/server/db/schema/definitions.js';
import { mirrorRemote } from '../../src/lib/server/db/schema/self-audit.js';
import { communityStandard } from '../../src/lib/server/db/schema/tenancy.js';
import { pushFailure, redact, runMirror } from '../../src/lib/server/jobs/mirror-job.js';
import { commitState, repoPath, writeBundle } from '../../src/lib/server/mirror/repo.js';
import {
	credentialFor,
	mirrorAudience,
	mirrorFiles,
	remoteView,
	setRemote
} from '../../src/lib/server/services/mirror.js';
import { restrict } from '../../src/lib/server/services/visibility.js';
import { getStandard } from '../../src/lib/server/standard/index.js';
import { createTestDb } from '../support/db.js';
import { catchRefusal } from '../support/errors.js';
import { makeCommunity, makeMembership, makeUser } from '../support/factories.js';

/**
 * "What if this app disappears." `docs/10-legal-and-operations.md` §1.3.
 *
 * The promise is portability and verifiable history, so the assertions are
 * about git rather than about our own tables: the bundle clones, `git log`
 * shows one commit per decision, and the files in it read as documents. If it
 * only works through Compass it is not a mirror.
 */
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);
const view = getStandard('rcos-core', '0.1');
const COUNTABLE = view.countableClauses()[0]!;

let db: Db;
let cleanup: () => void;
let ana: Ctx;
let standardRowId: string;
let scratch: string;

function adopt(body: string): string {
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
			updatedAt: new Date(NOW)
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
	scratch = mkdtempSync(join(tmpdir(), 'compass-mirror-test-'));

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
	rmSync(scratch, { recursive: true, force: true });
	rmSync(repoPath(ana.community.id), { recursive: true, force: true });
	vi.unstubAllEnvs();
	resetConfigForTests();
	setDbForTests(null);
	cleanup();
});

const git = (cwd: string, args: string[]) =>
	execFileSync('git', args, {
		cwd,
		encoding: 'utf8'
	});

describe('every community gets a repository, with no configuration', () => {
	it('commits, and the history reads with git alone', async () => {
		adopt('Members may leave at any time.');

		await runMirror(
			db,
			{ communityId: ana.community.id, actorName: 'Ana', subject: 'DEC-2026-001 — Exit' },
			NOW
		);

		// Cloned and read with git, not with us. That is the whole promise.
		const clone = join(scratch, 'clone');
		git(scratch, ['clone', repoPath(ana.community.id), clone]);

		const log = git(clone, ['log', '--format=%s%n%b']);
		expect(log).toContain('DEC-2026-001 — Exit');
		expect(log).toContain('Recorded by Ana');

		const files = git(clone, ['ls-files']);
		expect(files).toContain('artifacts/');
		const anyArtifact = files.split('\n').find((name) => name.startsWith('artifacts/'))!;
		expect(git(clone, ['show', `HEAD:${anyArtifact}`])).toContain('Members may leave at any time');
	});

	it('carries the decision register, not only the rules', async () => {
		adopt('Members may leave at any time.');

		await runMirror(
			db,
			{ communityId: ana.community.id, actorName: 'Ana', subject: 'DEC-2026-001 — Exit' },
			NOW
		);

		const clone = join(scratch, 'register');
		git(scratch, ['clone', repoPath(ana.community.id), clone]);

		// `specs/git-mirror`: the rendered artifact *and* the decision record. A
		// repository of rules with no account of how any of them were agreed is
		// the half that makes the history verifiable, missing.
		expect(git(clone, ['ls-files'])).toContain('decisions.md');
		expect(git(clone, ['show', 'HEAD:decisions.md'])).toContain('decision register');
	});

	it('names a service identity as the author, not a person', async () => {
		adopt('Members may leave at any time.');
		await runMirror(
			db,
			{ communityId: ana.community.id, actorName: 'Ana', subject: 'DEC-2026-001 — Exit' },
			NOW
		);
		const clone = join(scratch, 'clone');
		git(scratch, ['clone', repoPath(ana.community.id), clone]);

		// A repository may be public. A member's email address in the author field
		// would be published to everybody who clones, permanently, somewhere no
		// erasure flow reaches.
		const authors = git(clone, ['log', '--format=%an <%ae>']);
		expect(authors).toContain('RCOS Compass');
		expect(authors).not.toContain('ana@example.org');
	});

	it('writes a bundle a steward can clone from', async () => {
		adopt('Members may leave at any time.');
		await runMirror(
			db,
			{ communityId: ana.community.id, actorName: 'Ana', subject: 'DEC-2026-001 — Exit' },
			NOW
		);

		const bundle = join(scratch, 'history.bundle');
		await writeBundle(ana.community.id, bundle);

		const restored = join(scratch, 'from-bundle');
		git(scratch, ['clone', bundle, restored]);
		expect(git(restored, ['log', '--format=%s'])).toContain('DEC-2026-001');
	});

	it('leaves no empty commit when nothing published changed', async () => {
		await commitState({
			communityId: ana.community.id,
			files: { 'artifacts/x.md': '# Nothing' },
			subject: 'first',
			body: 'b',
			at: new Date(NOW)
		});
		const second = await commitState({
			communityId: ana.community.id,
			files: { 'artifacts/x.md': '# Nothing' },
			subject: 'second',
			body: 'b',
			at: new Date(NOW)
		});

		// A history somebody reads should not be padded with commits that changed
		// nothing.
		expect(second).toBeNull();
	});
});

describe('the mirror obeys visibility', () => {
	it('leaves restricted content out unless the community opted in', () => {
		const id = adopt('A sentence only the stewards may read.');
		restrict(
			ana,
			{ type: 'definition', id },
			{
				justification: 'Asked for by the member it concerns.',
				audience: 'stewards',
				expiresAt: new Date(NOW + 86_400_000)
			},
			{ db }
		);

		const withoutOptIn = mirrorFiles(db, mirrorAudience(ana.community.id, null), ana.community.id);
		expect(Object.values(withoutOptIn).join('\n')).not.toContain('only the stewards may read');

		const withOptIn = mirrorFiles(
			db,
			mirrorAudience(ana.community.id, { includeRestricted: true } as never),
			ana.community.id
		);
		expect(Object.values(withOptIn).join('\n')).toContain('only the stewards may read');
	});
});

describe('the credential', () => {
	const TOKEN = 'ghp_averyrealisticlookingtokenvalue';

	it('is not recoverable from the stored row', () => {
		setRemote(ana, { url: 'https://example.org/vv.git', credential: TOKEN }, { db });
		const row = db.select().from(mirrorRemote).get()!;

		// Not "the bytes differ from the plaintext" — base64 would satisfy that.
		// The property is that it cannot be opened without the instance secret.
		expect(JSON.stringify(row.credential)).not.toContain(TOKEN);
		expect(credentialFor(row)).toBe(TOKEN);

		vi.stubEnv('BETTER_AUTH_SECRET', 'a-completely-different-secret-value');
		resetConfigForTests();
		expect(credentialFor(row)).toBeNull();
	});

	it('is never readable back through the interface', () => {
		setRemote(ana, { url: 'https://example.org/vv.git', credential: TOKEN }, { db });
		const view = remoteView(ana, { db })!;

		// That one is set, and nothing else. A steward who forgets it re-enters it.
		expect(view.credentialSet).toBe(true);
		expect(JSON.stringify(view)).not.toContain(TOKEN);
		expect(view.url).toBe('https://example.org/vv.git');
	});

	it('reports a rotated secret rather than failing as an auth error later', () => {
		setRemote(ana, { url: 'https://example.org/vv.git', credential: TOKEN }, { db });
		db.update(mirrorRemote)
			.set({ credentialGeneration: 99 })
			.where(eq(mirrorRemote.communityId, ana.community.id))
			.run();

		expect(remoteView(ana, { db })!.credentialNeedsReentry).toBe(true);
	});

	it('refuses a remote that is not https', () => {
		for (const url of ['file:///tmp/evil.git', 'ssh://git@example.org/x.git', 'notaurl']) {
			expect(
				catchRefusal(() => setRemote(ana, { url, credential: TOKEN }, { db }))?.status,
				url
			).toBe(400);
		}
	});

	it('refuses a URL with the token already in it', () => {
		// git's own copy-paste form. Accepting it would write the token into the
		// plaintext `url` column beside the sealed copy — and show it back on the
		// settings screen to anybody who can open it.
		const refusal = catchRefusal(() =>
			setRemote(ana, { url: `https://ana:${TOKEN}@example.org/vv.git`, credential: TOKEN }, { db })
		);
		expect(refusal?.status).toBe(400);
		expect(db.select().from(mirrorRemote).all()).toEqual([]);
	});

	it('survives a round trip and refuses a tampered value', () => {
		const sealed = seal(TOKEN);
		expect(unseal(sealed)).toBe(TOKEN);

		const parts = sealed.ciphertext.split('.');
		const tampered = { ...sealed, ciphertext: [parts[0], parts[1], 'AAAA'].join('.') };
		expect(unseal(tampered)).toBeNull();
	});
});

describe('a push failure never carries the token', () => {
	const TOKEN = 'ghp_averyrealisticlookingtokenvalue';

	it('strips it out of whatever git said', () => {
		// This is what git actually prints: the remote URL, with the credential
		// in it, inside an otherwise ordinary error.
		const gitSaid =
			`remote: Invalid username or password.\n` +
			`fatal: Authentication failed for 'https://${TOKEN}@example.org/vv.git/'`;

		const stored = redact(gitSaid, TOKEN);

		expect(stored).not.toContain(TOKEN);
		// Still says what went wrong: a redacted message that says nothing leaves
		// a steward with a broken mirror and no idea why.
		expect(stored).toContain('Authentication failed');
	});

	it('strips it when git percent-encoded it', () => {
		const encoded = encodeURIComponent('tok/en+with=specials');
		const gitSaid = `fatal: could not read from 'https://${encoded}@example.org/vv.git'`;

		expect(redact(gitSaid, 'tok/en+with=specials')).not.toContain(encoded);
	});

	it('tells a steward what to do about a rejected push', () => {
		const gitSaid =
			`To https://${TOKEN}@example.org/vv.git\n` +
			` ! [rejected]        main -> main (non-fast-forward)\n` +
			`error: failed to push some refs`;

		const stored = pushFailure(gitSaid, TOKEN);

		// Since the push is never forced, this is the ordinary failure — and git's
		// own words describe the situation without naming the remedy.
		expect(stored).toContain('empty repository');
		expect(stored).not.toContain(TOKEN);
		expect(stored).not.toContain('non-fast-forward');
	});

	it('strips any embedded credential, even one it was not given', () => {
		// Belt and braces: a URL of the form https://anything@host is stripped
		// regardless, so a token that arrived by some route this function did not
		// anticipate still does not survive.
		const stored = redact("fatal: repository 'https://someothersecret@example.org/x.git'", 'x');
		expect(stored).not.toContain('someothersecret');
	});
});
