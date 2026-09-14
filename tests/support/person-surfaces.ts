import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { aiUsage } from '../../src/lib/server/db/schema/ai.js';
import { decision, decisionAttendee } from '../../src/lib/server/db/schema/decisions.js';
import { auditEvent, invitation, membership } from '../../src/lib/server/db/schema/tenancy.js';
import { listFormerMembers, listMembers } from '../../src/lib/server/services/members.js';
import { usageByMember } from '../../src/lib/server/services/ai-settings.js';
import { outwardAttribution } from '../../src/lib/server/services/attribution.js';
import { feedbackReport } from '../../src/lib/server/db/schema/operations.js';
import { listFeedback } from '../../src/lib/server/services/feedback.js';
import { listInvitations } from '../../src/lib/server/services/invitations.js';
import {
	addMessage,
	addProposal,
	listPostsWithAuthors,
	mentionDirectory,
	openDiscussion
} from '../../src/lib/server/services/discussions.js';
import { listResponses } from '../../src/lib/server/voting/consent-round.js';
import { getVotingProvider } from '../../src/lib/server/voting/index.js';
import { listPlatformAudit } from '../../src/lib/server/services/admin/audit.js';
import { document, documentFileVersion } from '../../src/lib/server/db/schema/documents.js';
import { libraryView, versionsWithPeople } from '../../src/lib/server/services/library.js';
import { workspaceView } from '../../src/lib/server/services/workspace.js';
import { activeStandardView } from '../../src/lib/server/services/completeness.js';
import { makeDocument, makeEvidence, makePassage } from './documents.js';
import { getTenant } from '../../src/lib/server/services/admin/communities.js';
import { notification } from '../../src/lib/server/db/schema/notifications.js';
import { listNotificationItems } from '../../src/lib/server/services/notifications.js';

/**
 * Every service that hands a person's name or address to a caller.
 * `docs/03-data-model.md` §10.
 *
 * The same mechanism as `read-paths.ts`, for the same reason and against a
 * different boundary. Erasure is not one change to one query: it is a promise
 * that *no surface* prints a name after it has been asked not to, and a promise
 * like that is kept by a list somebody has to add to rather than by whoever
 * writes the next service remembering.
 *
 * **Written before `personLabel` exists.** Every entry is `pending`, the suite
 * runs those under `it.fails`, and each one asserts what must eventually be
 * true — that an erased person reads as their community's former-member label.
 * Today that assertion fails because nothing erases and nothing labels, which is
 * a true statement about the code and clears itself: the moment a surface is
 * converted its test passes, `it.fails` goes red, and whoever converted it
 * deletes the marker.
 */

export type PersonSurface = {
	name: string;
	/**
	 * The module this surface lives in, relative to `src/lib/server/services/`.
	 * `everyPersonModuleIsCovered` checks the list against the modules that
	 * actually read the `user` table, so a service added in a later phase is a
	 * failure here rather than a name printed somewhere nobody looked.
	 */
	module: string;
	/**
	 * Set while a surface cannot yet render an erased person. The suite runs such
	 * an entry under `it.fails`, so it asserts something true rather than being
	 * skipped, and the marker clears itself: converting the surface makes the
	 * test pass, which makes `it.fails` go red.
	 *
	 * Nothing is pending today. The field stays because the next phase to add a
	 * surface needs it.
	 */
	pending?: string;
	/** Everything the surface needs in order to have a person to render. */
	seed?: (db: Db, ctx: Ctx, subject: Subject) => void;
	/** What the surface says about that person, as strings. */
	read: (ctx: Ctx, db: Db, subject: Subject) => string[];
	/**
	 * What must appear in place of the name. Defaults to the community-local
	 * label; a platform-wide surface has no community and so no number.
	 */
	expect?: RegExp;
};

/**
 * The person who gets erased, who is deliberately not the reader.
 *
 * They are a steward but not the owner: erasure refuses while somebody owns a
 * community, so a registry whose subject was the owner would assert nothing at
 * all — every entry would fail on the refusal rather than on the rendering.
 */
export type Subject = {
	userId: string;
	membershipId: string;
	email: string;
	name: string;
};

const DECISION_ID = '01a00000-0000-7000-8000-000000000001';
const LIBRARY_DOCUMENT_ID = '01a00000-0000-7000-8000-000000000002';
const VERSIONED_DOCUMENT_ID = '01a00000-0000-7000-8000-000000000003';
const WORKSPACE_DOCUMENT_ID = '01a00000-0000-7000-8000-000000000004';

/** Set by the thread surface's seed, read by its `read`. */
let threadForPersonSurface = '';

/** Set by the vote-block surface's seed, read by its `read`. */
let roundForPersonSurface = '';

export const PERSON_SURFACES: PersonSurface[] = [
	{
		name: 'members.listMembers',
		module: 'members.ts',
		read: (ctx) => listMembers(ctx).map((row) => row.name)
	},
	{
		name: 'members.listFormerMembers',
		module: 'members.ts',
		/**
		 * The same list, one column over — and the surface the member screen made
		 * necessary. Somebody who has left keeps their row, because the register
		 * refers to memberships rather than to people, so a departed member who is
		 * later erased is a person whose name sits in a second query that the
		 * first one's conversion would not have touched.
		 */
		seed: (db, _ctx, subject) => {
			db.update(membership)
				.set({ endedAt: new Date(0) })
				.where(eq(membership.id, subject.membershipId))
				.run();
		},
		read: (ctx) => listFormerMembers(ctx).map((row) => row.name)
	},
	{
		name: 'discussions.listPostsWithAuthors',
		module: 'discussions.ts',
		/**
		 * The thread names whoever wrote each post, which is the first surface
		 * where a person's name sits beside something they *said* rather than in a
		 * list of members. What they wrote stays — erasure removes the name, not
		 * the conversation other people answered.
		 */
		seed: (db, ctx, subject) => {
			const subjectCtx = {
				...ctx,
				user: { ...ctx.user, id: subject.userId },
				membership: { ...ctx.membership, id: subject.membershipId }
			} as Ctx;
			const opened = openDiscussion(
				subjectCtx,
				{ title: 'Exit and separation', about: { kind: 'open_question' } },
				{ db }
			);
			addMessage(subjectCtx, { discussionId: opened.id, body: 'I think we should.' }, { db });
			threadForPersonSurface = opened.id;
		},
		read: (ctx, db) =>
			listPostsWithAuthors(ctx, threadForPersonSurface, { db }).map((row) => row.author.label)
	},
	{
		name: 'discussions.mentionDirectory',
		module: 'discussions.ts',
		/**
		 * `@M-0142` in a post, named when the thread is shown, and the members the
		 * composer offers. The post keeps the number, so an erased member's
		 * mentions read as their label without anything being rewritten.
		 */
		read: (ctx, db, subject) => {
			const { seq } = db
				.select({ seq: membership.seq })
				.from(membership)
				.where(eq(membership.id, subject.membershipId))
				.get()!;
			const directory = mentionDirectory(ctx, [`@M-${String(seq).padStart(4, '0')}`], { db });
			return [
				...Object.values(directory.labels),
				...directory.members.map((member) => member.label)
			];
		}
	},
	{
		name: 'notifications.listNotificationItems',
		module: 'notifications.ts',
		/**
		 * A mention names who mentioned you. The row keeps a membership id, never a
		 * name, so an erased mentioner reads as the former-member label the moment
		 * the list is rendered — not whatever their name was when they wrote.
		 */
		seed: (db, ctx, subject) => {
			const opened = openDiscussion(
				ctx,
				{ title: 'Exit and separation', about: { kind: 'open_question' } },
				{ db }
			);
			db.insert(notification)
				.values({
					id: newId(),
					communityId: ctx.community.id,
					recipientMembershipId: ctx.membership.id,
					kind: 'discussion.mention',
					subjectType: 'discussion',
					subjectId: opened.id,
					summary: 'You were mentioned in Exit and separation',
					params: { title: 'Exit and separation', actor: subject.membershipId },
					createdAt: new Date(ctx.now())
				})
				.run();
		},
		read: (ctx, db) =>
			listNotificationItems(ctx, { db })
				.map((row) => row.actor)
				.filter((label): label is string => label !== null)
	},
	{
		name: 'voting.listResponses',
		module: 'voting/consent-round.ts',
		/**
		 * The vote block names everyone who answered. An erased member is still
		 * listed and still counted — dropping their row would silently change a
		 * tally the community was given, and a decision may already quote it.
		 */
		seed: (db, ctx, subject) => {
			const subjectCtx = {
				...ctx,
				user: { ...ctx.user, id: subject.userId },
				membership: { ...ctx.membership, id: subject.membershipId }
			} as Ctx;
			const opened = openDiscussion(
				subjectCtx,
				{ title: 'Exit and separation', about: { kind: 'open_question' } },
				{ db }
			);
			const proposal = addProposal(
				subjectCtx,
				{ discussionId: opened.id, body: 'Members may leave.' },
				{ db }
			);
			roundForPersonSurface = getVotingProvider().respond(
				subjectCtx,
				{ proposalPostId: proposal.id, value: 'consent' },
				{ db }
			).id;
		},
		read: (ctx, db) => listResponses(ctx, roundForPersonSurface, { db }).map((row) => row.who)
	},
	{
		name: 'ai-settings.usageByMember',
		module: 'ai-settings.ts',
		// An address rather than a name, which is worse: a steward's usage table
		// would print the erased person's email until this goes through the same
		// function as everything else.
		seed: (db, ctx, subject) => {
			db.insert(aiUsage)
				.values({
					communityId: ctx.community.id,
					actorId: subject.userId,
					periodMonth: new Intl.DateTimeFormat('en-CA', {
						timeZone: ctx.community.timezone,
						year: 'numeric',
						month: '2-digit'
					})
						.format(new Date(ctx.now()))
						.slice(0, 7),
					periodDay: '2026-10-01',
					tasks: 1,
					tokens: 100
				})
				.run();
		},
		read: (ctx, db) => usageByMember(ctx, { db }).map((row) => row.person)
	},
	{
		name: 'attribution.outwardAttribution',
		module: 'attribution.ts',
		// The one surface where a name reaches the open web, and so the one where
		// getting this wrong is not recoverable.
		seed: (db, ctx, subject) => {
			db.insert(decision)
				.values({
					id: DECISION_ID,
					communityId: ctx.community.id,
					seq: 1,
					ref: 'DEC-2026-001',
					title: 'Spending authority',
					type: 'strategic',
					layer: null,
					mechanism: 'consent',
					threshold: null,
					tallyPresent: 1,
					tallyFor: 1,
					tallyAgainst: 0,
					unresolvedObjections: 0,
					rationale: null,
					proposalText: 'Any spend over €500 needs a consent decision.',
					decidedAt: new Date(0),
					reviewDueAt: null,
					source: 'online',
					provisional: false,
					status: 'active',
					supersededById: null,
					idempotencyKey: 'person-surfaces',
					recordedBy: ctx.user.id,
					proposalPostId: null
				})
				.run();
			db.insert(decisionAttendee)
				.values({
					id: newId(),
					decisionId: DECISION_ID,
					membershipId: subject.membershipId,
					externalName: null,
					// They said yes. Erasure is the later, stronger instruction.
					consentedToPublish: true
				})
				.run();
		},
		read: (ctx, db) => {
			const row = db.select().from(decision).where(eq(decision.id, DECISION_ID)).get()!;
			return outwardAttribution(db, row, 'named_with_consent').named;
		},
		/**
		 * Nothing, deliberately, and this is the one surface where that is right.
		 *
		 * The named list says who agreed to be named *outwardly*, on a page the
		 * open web can read. Somebody who has since asked to be forgotten gave the
		 * earlier and weaker instruction, so they are dropped rather than
		 * labelled — and they stay in `unnamed`, so the count still says how many
		 * people were in the room.
		 */
		expect: /^$/
	},
	{
		name: 'admin/audit.listPlatformAudit',
		module: 'admin/audit.ts',
		// The platform trail has no community in scope for a sign-in failure, so
		// this is the surface that proves the second half of the rule: an erased
		// person with no community reads as an erased account and carries no
		// number that could join two communities' records together.
		seed: (db, _ctx, subject) => {
			db.insert(auditEvent)
				.values({
					id: newId(),
					at: new Date(0),
					actorId: subject.userId,
					actorEmail: subject.email,
					communityId: null,
					action: 'auth.signin.failed',
					target: null,
					ip: '203.0.113.4',
					userAgent: null,
					meta: null
				})
				.run();
		},
		read: (_ctx, db) => listPlatformAudit({}, db).map((row) => row.actorEmail ?? ''),
		expect: /Erased account/
	},
	{
		name: 'feedback.listFeedback',
		module: 'feedback.ts',
		// The registry caught this one the moment the service existed, which is the
		// argument for having it: a new surface is a failing test rather than a
		// name printed somewhere nobody looked.
		seed: (db, ctx, subject) => {
			db.insert(feedbackReport)
				.values({
					id: newId(),
					communityId: ctx.community.id,
					membershipId: subject.membershipId,
					route: '/c/x/path',
					kind: 'confusing',
					body: 'The ordering made no sense to me.',
					status: 'open',
					createdAt: new Date(0),
					handledAt: null
				})
				.run();
		},
		read: (ctx, db) => listFeedback(ctx, { db }).map((row) => row.from)
	},
	{
		name: 'invitations.listInvitations',
		module: 'invitations.ts',
		/**
		 * Not a rendering at all — a standing copy of the address, and a live way
		 * back into the community. The registry's backstop found this one, which
		 * is the entire argument for having a backstop: a list written from memory
		 * would have covered the five surfaces that print a name and missed the
		 * one that holds an address.
		 */
		seed: (db, ctx, subject) => {
			db.insert(invitation)
				.values({
					id: newId(),
					communityId: ctx.community.id,
					email: subject.email,
					role: 'member',
					grantsOwner: false,
					tokenHash: 'x'.repeat(64),
					expiresAt: new Date(Date.UTC(2027, 0, 1)),
					acceptedAt: null,
					acceptedBy: null,
					revokedAt: null,
					invitedBy: ctx.user.id,
					createdAt: new Date(0)
				})
				.run();
		},
		read: (ctx, db) => listInvitations(ctx, { db }).map((row) => row.email),
		// Nothing at all: the invitation is revoked, so it is not pending, so it is
		// not listed. There is no label because there is no longer a row to label.
		expect: /^$/
	},
	{
		name: 'library.libraryView',
		module: 'library.ts',
		/**
		 * "added 21 Aug by Ana" on every library row. The document stays — a
		 * community's bylaws do not leave with the member who uploaded them — and
		 * only the name beside it changes.
		 */
		seed: (db, ctx, subject) => {
			db.insert(document)
				.values({
					id: LIBRARY_DOCUMENT_ID,
					communityId: ctx.community.id,
					filename: 'bylaws.pdf',
					mime: 'application/pdf',
					bytes: 10,
					sha256: 'd'.repeat(64),
					storageKey: `${ctx.community.id}/library-surface`,
					status: 'extracted',
					uploadedBy: subject.userId,
					uploadedAt: new Date(0)
				})
				.run();
		},
		read: (ctx, db) =>
			libraryView(ctx, 'all', { db })
				.rows.map((row) => row.uploader ?? '')
				.filter(Boolean)
	},
	{
		name: 'library.versionsWithPeople',
		module: 'library.ts',
		/** Who uploaded each earlier file, and who replaced it — both names, both labelled. */
		seed: (db, ctx, subject) => {
			db.insert(document)
				.values({
					id: VERSIONED_DOCUMENT_ID,
					communityId: ctx.community.id,
					filename: 'bylaws-2024.pdf',
					mime: 'application/pdf',
					bytes: 10,
					sha256: 'e'.repeat(64),
					storageKey: `${ctx.community.id}/versioned-surface`,
					status: 'extracted',
					uploadedBy: ctx.user.id,
					uploadedAt: new Date(0)
				})
				.run();
			db.insert(documentFileVersion)
				.values({
					id: newId(),
					documentId: VERSIONED_DOCUMENT_ID,
					communityId: ctx.community.id,
					filename: 'bylaws-2019.pdf',
					mime: 'application/pdf',
					bytes: 10,
					sha256: 'f'.repeat(64),
					storageKey: `${ctx.community.id}/versioned-surface-old`,
					uploadedBy: subject.userId,
					uploadedAt: new Date(0),
					supersededBy: subject.userId,
					supersededAt: new Date(0)
				})
				.run();
		},
		read: (ctx, db) =>
			versionsWithPeople(ctx, VERSIONED_DOCUMENT_ID, { db }).flatMap((row) => [
				row.uploader ?? '',
				row.supersededBy ?? ''
			])
	},
	{
		name: 'workspace.workspaceView',
		module: 'workspace.ts',
		/**
		 * "Mapped · confirmed by Ana, 29 Aug" on a card, and the same line on a
		 * claim waiting to be re-confirmed. The claim stays; the name beside it
		 * becomes a former member's.
		 */
		seed: (db, ctx, subject) => {
			makeDocument(db, ctx.community.id, { id: WORKSPACE_DOCUMENT_ID });
			makeEvidence(db, {
				communityId: ctx.community.id,
				communityStandardId: activeStandardView(db, ctx)!.row.id,
				passage: makePassage(db, WORKSPACE_DOCUMENT_ID),
				state: 'confirmed',
				suggestedBy: 'human',
				confirmedBy: subject.userId
			});
		},
		read: (ctx, db) =>
			workspaceView(ctx, WORKSPACE_DOCUMENT_ID, { page: null, passage: null }, { db })
				.cards.map((card) => card.confirmer ?? '')
				.filter(Boolean)
	},
	{
		name: 'admin/communities.getTenant',
		module: 'admin/communities.ts',
		/**
		 * The steward list rather than `listTenants`'s owner address, which cannot
		 * show an erased person at all: erasure is refused while somebody owns a
		 * community, so an entry pointed there would pass whatever the code did.
		 * A registry entry that cannot fail reads as coverage and is worse than no
		 * entry — the same reason `read-paths.ts` leaves the aggregates out.
		 */
		read: (ctx, db) => (getTenant(db, ctx.community.id)?.stewards ?? []).map((row) => row.email)
	}
];

/**
 * Modules that read the `user` table and hand nobody a name.
 *
 * The same shape as an exempt route, and for the same reason: "this one is
 * fine" has to cost a sentence, or the backstop becomes a list somebody adds to
 * whenever it goes red.
 */
export const NOT_A_PERSON_SURFACE: Record<string, string> = {
	'erasure.ts':
		'Removes a person rather than rendering one. Its own suite asserts what is left behind.',
	'admin/status.ts': 'Counts and sizes only; the status page shows no member at all.',
	'time-zone.ts':
		'Writes and reads a person’s own time zone; it never renders a name or an address.',
	'mapping.ts':
		'Reads the user only to rebuild the context a scan runs as; its notification names the document, never a person.'
};

/**
 * The modules that read the `user` table, from the source rather than from
 * memory.
 *
 * A registry checked only against itself is a registry that is complete by
 * definition. This is the backstop: any service module importing the `user`
 * table is a module that can print a person, and it must appear above.
 */
export function personModulesInSource(
	roots: string[] = ['src/lib/server/services', 'src/lib/server/voting']
): string[] {
	const found: string[] = [];

	const walk = (dir: string, prefix: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(path, `${prefix}${entry.name}/`);
				continue;
			}
			if (!entry.name.endsWith('.ts')) continue;
			const source = readFileSync(path, 'utf8');
			// The table, not the type: `import type { User }` prints nothing.
			if (/import\s*\{[^}]*\buser\b[^}]*\}\s*from\s*'[^']*schema\/auth/.test(source)) {
				found.push(`${prefix}${entry.name}`);
			}
		}
	};

	// `voting/` as well as `services/`: the consent provider prints the people who
	// responded, and a module that can name somebody is in scope for this promise
	// wherever it happens to live. Its entries carry a `voting/` prefix so the
	// registry's module names stay unambiguous.
	for (const root of roots) {
		walk(root, root.endsWith('/voting') ? 'voting/' : '');
	}
	return found.sort();
}
