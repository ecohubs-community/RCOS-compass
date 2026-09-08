import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { mirrorRemote } from '../db/schema/self-audit.js';
import { community } from '../db/schema/tenancy.js';
import { getLogger } from '../logger.js';
import { commitState, pushToRemote } from '../mirror/repo.js';
import { credentialFor, getRemote, mirrorAudience, mirrorFiles } from '../services/mirror.js';

/**
 * Commit after a freeze, and push if there is anywhere to push to.
 *
 * **After the transaction commits, never inside it.** A failing mirror must not
 * block, delay or roll back governance: the decision is the thing that
 * mattered, and a repository that is an hour behind is a repository that is an
 * hour behind. `docs/00` §9 makes exactly this call, and the notification
 * argument in P3 is the other half of it.
 */
export type MirrorPayload = { communityId: string; actorName: string; subject: string };

export async function runMirror(db: Db, payload: MirrorPayload, now: number): Promise<void> {
	const home = db.select().from(community).where(eq(community.id, payload.communityId)).get();
	if (!home) return;

	const remote = getRemote(db, home.id);
	const files = mirrorFiles(db, mirrorAudience(home.id, remote), home.id);

	const sha = await commitState({
		communityId: home.id,
		files,
		subject: payload.subject,
		// The person in the body rather than the author field, so a public
		// repository does not carry their email address forever.
		body: `Recorded by ${payload.actorName} in ${home.name}.`,
		at: new Date(now)
	});
	if (!sha) return;

	if (!remote) return;

	const credential = credentialFor(remote);
	if (!credential) {
		// A rotated instance secret, or a tampered row. Reported rather than
		// retried: no amount of retrying will open it.
		db.update(mirrorRemote)
			.set({ lastError: 'The stored token could not be read. Enter it again.' })
			.where(eq(mirrorRemote.communityId, home.id))
			.run();
		return;
	}

	try {
		await pushToRemote(home.id, remote.url, credential);
		db.update(mirrorRemote)
			.set({ lastPushedAt: new Date(now), lastError: null })
			.where(eq(mirrorRemote.communityId, home.id))
			.run();
	} catch (problem) {
		/**
		 * Never the credential, in the row or in the log.
		 *
		 * git puts the whole remote URL in its error output, and that URL contains
		 * the token — so the message is rewritten to the configured URL before it
		 * is stored or logged. This is the single most likely way for the secret
		 * to end up somewhere it can be read.
		 */
		const message = redact(
			String((problem as { message?: string }).message ?? problem),
			credential
		);
		db.update(mirrorRemote)
			.set({ lastError: message.slice(0, 500) })
			.where(eq(mirrorRemote.communityId, home.id))
			.run();
		getLogger().warn({ communityId: home.id, err: message }, 'mirror push failed');
		/**
		 * Rethrown so the queue retries with backoff — the commit is already safe
		 * in the local repository either way.
		 *
		 * Deliberately *without* `cause`. git puts the whole remote URL in its
		 * error output and that URL carries the token, so attaching the original
		 * would put the credential into the error chain and from there into every
		 * log line and dead-letter record that prints it. The redacted message is
		 * the whole of what may travel.
		 */
		// eslint-disable-next-line preserve-caught-error
		throw new Error(message);
	}
}

/**
 * Strip the credential out of whatever git said.
 *
 * Exported because it is the property worth testing directly: git prints the
 * whole remote URL — token and all — in its error output, so this is the last
 * thing standing between a stored token and every log line and dead-letter
 * record that prints a failure. The network behaviour around it is not the
 * point; this function is.
 */
export function redact(message: string, credential: string): string {
	return message
		.split(credential)
		.join('***')
		.split(encodeURIComponent(credential))
		.join('***')
		.replace(/https:\/\/[^@\s]*@/g, 'https://');
}
