import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Ctx } from '../../src/lib/server/auth/guard.js';
import { newId } from '../../src/lib/server/db/id.js';
import type { Db } from '../../src/lib/server/db/index.js';
import { decision, decisionAttendee } from '../../src/lib/server/db/schema/decisions.js';
import { invitation } from '../../src/lib/server/db/schema/tenancy.js';
import { listMembers } from '../../src/lib/server/services/members.js';
import { usageByMember } from '../../src/lib/server/services/ai-settings.js';
import { outwardAttribution } from '../../src/lib/server/services/attribution.js';
import { listInvitations } from '../../src/lib/server/services/invitations.js';
import { listPlatformAudit } from '../../src/lib/server/services/admin/audit.js';
import { listTenants } from '../../src/lib/server/services/admin/communities.js';

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
	/** Set while the surface cannot yet render an erased person. */
	pending?: string;
	/** Everything the surface needs in order to have a person to render. */
	seed?: (db: Db, ctx: Ctx) => void;
	/** What the surface says about that person, as strings. */
	read: (ctx: Ctx, db: Db) => string[];
};

const NOT_YET = 'personLabel does not exist yet';

const DECISION_ID = '01a00000-0000-7000-8000-000000000001';

export const PERSON_SURFACES: PersonSurface[] = [
	{
		name: 'members.listMembers',
		module: 'members.ts',
		pending: NOT_YET,
		read: (ctx) => listMembers(ctx).map((row) => row.name)
	},
	{
		name: 'ai-settings.usageByMember',
		module: 'ai-settings.ts',
		pending: NOT_YET,
		// An address rather than a name, which is worse: a steward's usage table
		// would print the erased person's email until this goes through the same
		// function as everything else.
		read: (ctx, db) => usageByMember(ctx, { db }).map((row) => row.email)
	},
	{
		name: 'attribution.outwardAttribution',
		module: 'attribution.ts',
		pending: NOT_YET,
		// The one surface where a name reaches the open web, and so the one where
		// getting this wrong is not recoverable.
		seed: (db, ctx) => {
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
					membershipId: ctx.membership.id,
					externalName: null,
					// They said yes. Erasure is the later, stronger instruction.
					consentedToPublish: true
				})
				.run();
		},
		read: (ctx, db) => {
			const row = db.select().from(decision).where(eq(decision.id, DECISION_ID)).get()!;
			return outwardAttribution(db, row, 'named_with_consent').named;
		}
	},
	{
		name: 'admin/audit.listPlatformAudit',
		module: 'admin/audit.ts',
		pending: NOT_YET,
		// The platform trail has no community in scope for a sign-in failure, so
		// this is the surface that proves the second half of the rule: an erased
		// person with no community reads as an erased account and carries no
		// number that could join two communities' records together.
		read: (_ctx, db) => listPlatformAudit({}, db).map((row) => row.actorEmail ?? '')
	},
	{
		name: 'invitations.listInvitations',
		module: 'invitations.ts',
		pending: NOT_YET,
		/**
		 * Not a rendering at all — a standing copy of the address, and a live way
		 * back into the community. The registry's backstop found this one, which
		 * is the entire argument for having a backstop: a list written from memory
		 * would have covered the five surfaces that print a name and missed the
		 * one that holds an address.
		 */
		seed: (db, ctx) => {
			db.insert(invitation)
				.values({
					id: newId(),
					communityId: ctx.community.id,
					email: ctx.user.email,
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
		read: (ctx, db) => listInvitations(ctx, { db }).map((row) => row.email)
	},
	{
		name: 'admin/communities.listTenants',
		module: 'admin/communities.ts',
		pending: NOT_YET,
		read: (_ctx, db) => listTenants(db).map((row) => row.ownerEmail ?? '')
	}
];

/**
 * The modules that read the `user` table, from the source rather than from
 * memory.
 *
 * A registry checked only against itself is a registry that is complete by
 * definition. This is the backstop: any service module importing the `user`
 * table is a module that can print a person, and it must appear above.
 */
export function personModulesInSource(root = 'src/lib/server/services'): string[] {
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

	walk(root, '');
	return found.sort();
}
