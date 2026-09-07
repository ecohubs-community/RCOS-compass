import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { anonymousIn, scopedTo, type Audience } from '../auth/audience.js';
import { requirePermission, requireWritableCommunity, type Ctx } from '../auth/guard.js';
import { seal, unseal, CREDENTIAL_GENERATION, type Sealed } from '../crypto/sealed.js';
import { getDb, type Db } from '../db/index.js';
import { mirrorRemote, type MirrorRemote } from '../db/schema/self-audit.js';
import { community } from '../db/schema/tenancy.js';
import { standardViewFor } from './completeness.js';
import { artifactToMarkdown, renderArtifact } from './render-artifact.js';

/**
 * What goes into a community's repository, and where else it goes.
 *
 * **The mirror is an outward path, so it obeys `visibleTo` like every other
 * one.** A remote may be a public repository — that is often the point — and
 * pushing is publishing. By default the mirror carries what the community
 * published plus what its members can see; restricted content is excluded
 * unless a steward opts in explicitly, which is a separate, deliberate act.
 */

/** What the mirror commits, for a given audience. */
export function mirrorFiles(
	db: Db,
	audience: Audience,
	communityId: string
): Record<string, string> {
	const standard = standardViewFor(db, communityId);
	if (!standard) return {};

	const files: Record<string, string> = {};
	for (const artifact of standard.view.artifacts) {
		const rendered = renderArtifact(db, audience, artifact.key);
		if (!rendered) continue;
		// Only artifacts with something in them: a repository of ninety empty
		// documents is noise somebody has to read past.
		if (rendered.sections.every((section) => section.body === null)) continue;
		files[`artifacts/${artifact.key}.md`] = artifactToMarkdown(rendered);
	}
	return files;
}

/**
 * Which audience the mirror renders as.
 *
 * A community that has not opted in gets what its *members* see, which is the
 * honest reading of "our history": the mirror is theirs, and a repository
 * missing everything they had not published would be a strange archive. Opting
 * in to restricted content is the wider setting; there is no narrower one,
 * because a mirror of only the public artifacts is what the export already is.
 */
export function mirrorAudience(communityId: string, remote: MirrorRemote | null): Audience {
	return scopedTo(
		communityId,
		remote?.includeRestricted ? ['member', 'world', 'restricted'] : ['member', 'world']
	);
}

export function getRemote(db: Db, communityId: string): MirrorRemote | null {
	return (
		db.select().from(mirrorRemote).where(eq(mirrorRemote.communityId, communityId)).get() ?? null
	);
}

/** What a steward may see about the remote: everything except the credential. */
export type RemoteView = {
	url: string;
	includeRestricted: boolean;
	credentialSet: boolean;
	credentialNeedsReentry: boolean;
	lastPushedAt: number | null;
	lastError: string | null;
};

export function remoteView(ctx: Ctx, options: { db?: Db } = {}): RemoteView | null {
	requirePermission(ctx, 'community.read');
	const db = options.db ?? getDb();
	const row = getRemote(db, ctx.community.id);
	if (!row) return null;

	return {
		url: row.url,
		includeRestricted: row.includeRestricted,
		// That one is set, never what it is. A steward who forgets it re-enters
		// it; nobody retrieves it, including us.
		credentialSet: true,
		credentialNeedsReentry: row.credentialGeneration !== CREDENTIAL_GENERATION,
		lastPushedAt: row.lastPushedAt?.getTime() ?? null,
		lastError: row.lastError
	};
}

export function setRemote(
	ctx: Ctx,
	input: { url: string; credential: string; includeRestricted?: boolean },
	options: { db?: Db } = {}
): void {
	requirePermission(ctx, 'settings.manage');
	requireWritableCommunity(ctx);

	const url = input.url.trim();
	// `https://` only: an `ssh://` remote would need a key on disk, and a
	// `file://` one would let a steward point the mirror at the server's own
	// filesystem.
	if (!/^https:\/\/[^\s]+$/.test(url)) error(400, 'A remote has to be an https:// URL.');
	if (!input.credential.trim()) error(400, 'A remote needs a token to push with.');

	const db = options.db ?? getDb();
	const sealed = seal(input.credential.trim());
	const row = {
		communityId: ctx.community.id,
		url,
		credential: sealed,
		credentialGeneration: sealed.generation,
		includeRestricted: input.includeRestricted ?? false,
		lastPushedAt: null,
		lastError: null,
		updatedBy: ctx.user.id,
		updatedAt: new Date(ctx.now())
	};

	db.insert(mirrorRemote)
		.values(row)
		.onConflictDoUpdate({ target: mirrorRemote.communityId, set: row })
		.run();

	db.update(community)
		.set({ gitMirrorEnabled: true, updatedAt: new Date(ctx.now()) })
		.where(eq(community.id, ctx.community.id))
		.run();
}

/** Stops pushing. Every commit already made stays exactly where it is. */
export function removeRemote(ctx: Ctx, options: { db?: Db } = {}): void {
	requirePermission(ctx, 'settings.manage');
	const db = options.db ?? getDb();
	db.delete(mirrorRemote).where(eq(mirrorRemote.communityId, ctx.community.id)).run();
	db.update(community)
		.set({ gitMirrorEnabled: false, updatedAt: new Date(ctx.now()) })
		.where(eq(community.id, ctx.community.id))
		.run();
}

/** The credential, for the job that pushes. Null when it cannot be opened. */
export function credentialFor(remote: MirrorRemote): string | null {
	return unseal(remote.credential as Sealed);
}

export { anonymousIn };
