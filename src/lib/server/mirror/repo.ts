import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { absolutePathOf } from '../documents/storage.js';

const run = promisify(execFile);

/**
 * A community's history, as a git repository it can walk away with.
 * `docs/00-architecture.md` §9, UI spec §8.1.
 *
 * The point is not backup — that is what the database snapshots are for. It is
 * portability and verifiable history: a repository the community controls, one
 * commit per decision, readable with git alone and no Compass. `docs/10` §1.3
 * states it in the terms rather than offering it as a feature.
 *
 * **Every community gets one with no configuration.** A mirror that required a
 * GitHub account would exclude exactly the communities most likely to want data
 * sovereignty, and one that could never leave the server would be a backup we
 * keep for them, which is not the promise. Linking a remote adds a second place
 * the same commits go, and changes nothing about what is in them.
 *
 * Shelling out to `git` rather than reimplementing it: the format is the
 * artefact, and a hand-rolled writer that produces something `git log` refuses
 * would fail exactly when somebody needed it most.
 */

/** Where a community's bare repository lives, beside its uploads. */
export const repoPath = (communityId: string) => absolutePathOf(`${communityId}/mirror.git`);

const IDENTITY = {
	/**
	 * A service identity, decided in `decisions-0.4.md`.
	 *
	 * A git author is an email address and the repository may be public — that is
	 * the point of linking a remote. Putting a member's personal address in the
	 * author field publishes it to anybody who clones, permanently, somewhere no
	 * erasure flow reaches. The person who froze the decision is named in the
	 * message body instead, where the audit question is actually answered.
	 */
	GIT_AUTHOR_NAME: 'RCOS Compass',
	GIT_AUTHOR_EMAIL: 'noreply@localhost',
	GIT_COMMITTER_NAME: 'RCOS Compass',
	GIT_COMMITTER_EMAIL: 'noreply@localhost'
};

/**
 * `process.env` here is a *subprocess environment*, not configuration.
 *
 * The no-`process.env` rule exists so settings are read once through the
 * validated module (`docs/00` §10). Handing a child process the environment it
 * needs to run — PATH above all — is a different thing, and the alternative is
 * a `git` invocation that cannot find its own helpers. Nothing below is read as
 * a setting.
 */
// eslint-disable-next-line no-restricted-properties
const inherited = () => process.env;

async function git(cwd: string, args: string[], env: Record<string, string> = {}) {
	return run('git', args, {
		cwd,
		env: { ...inherited(), ...IDENTITY, ...env, GIT_TERMINAL_PROMPT: '0' },
		maxBuffer: 32 * 1024 * 1024
	});
}

/** Idempotent: an existing repository is left exactly as it is. */
export async function ensureRepo(communityId: string): Promise<string> {
	const path = repoPath(communityId);
	await mkdir(dirname(path), { recursive: true });
	try {
		await git(path, ['rev-parse', '--git-dir']);
	} catch {
		await mkdir(path, { recursive: true });
		await git(path, ['init', '--bare', '--initial-branch=main', '.']);
	}
	return path;
}

export type CommitInput = {
	communityId: string;
	/** Path → contents. The whole tree each time; git stores the difference. */
	files: Record<string, string>;
	subject: string;
	/** Who did the thing, named in the body rather than in the author field. */
	body: string;
	at: Date;
};

/**
 * Write one commit containing the community's published state.
 *
 * A working tree in a temporary directory rather than plumbing commands: it is
 * a handful of files, and `git add -A` deleting what has gone is the behaviour
 * we want without having to implement it.
 */
export async function commitState(input: CommitInput): Promise<string | null> {
	const bare = await ensureRepo(input.communityId);
	const work = await mkdtemp(join(tmpdir(), 'compass-mirror-'));

	try {
		try {
			await git(work, ['clone', bare, '.']);
		} catch {
			// An empty repository has nothing to clone from.
			await git(work, ['init', '--initial-branch=main', '.']);
			await git(work, ['remote', 'add', 'origin', bare]);
		}

		// Everything tracked goes first, so a withdrawn artifact leaves the mirror
		// the way it left the public page.
		await rm(join(work, 'artifacts'), { recursive: true, force: true });

		for (const [path, contents] of Object.entries(input.files)) {
			const full = join(work, path);
			await mkdir(dirname(full), { recursive: true });
			await writeFile(full, contents, 'utf8');
		}

		await git(work, ['add', '-A']);
		const status = await git(work, ['status', '--porcelain']);
		// Nothing changed — a freeze that touched nothing published should not
		// leave an empty commit in a history somebody reads.
		if (!status.stdout.trim()) return null;

		const when = input.at.toISOString();
		await git(work, ['commit', '-m', input.subject, '-m', input.body], {
			GIT_AUTHOR_DATE: when,
			GIT_COMMITTER_DATE: when
		});
		await git(work, ['push', 'origin', 'HEAD:main']);

		const head = await git(work, ['rev-parse', 'HEAD']);
		return head.stdout.trim();
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

/** The whole history as one file a steward can download and clone. */
export async function writeBundle(communityId: string, destination: string): Promise<void> {
	const bare = await ensureRepo(communityId);
	await mkdir(dirname(destination), { recursive: true });
	await git(bare, ['bundle', 'create', destination, '--all']);
}

/**
 * Push to the community's own remote.
 *
 * The credential goes in the URL because that is what git accepts for HTTPS,
 * and that URL is therefore never logged — the caller reports failures against
 * the *configured* URL, not this one.
 */
export async function pushToRemote(
	communityId: string,
	url: string,
	credential: string
): Promise<void> {
	const bare = await ensureRepo(communityId);
	const authenticated = url.replace(/^https:\/\//, `https://${encodeURIComponent(credential)}@`);
	await git(bare, ['push', '--force', authenticated, 'main:main']);
}
