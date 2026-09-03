import type { Db } from '../../src/lib/server/db/index.js';
import { newId } from '../../src/lib/server/db/id.js';
import { user } from '../../src/lib/server/db/schema/auth.js';
import { community, membership } from '../../src/lib/server/db/schema/tenancy.js';
import type { Role } from '../../src/lib/server/db/schema/tenancy.js';

/** Deterministic fixtures. docs/06-testing-strategy.md §8. */
const NOW = new Date(Date.UTC(2026, 8, 2, 12, 0, 0));

export function makeUser(db: Db, overrides: { email?: string; verified?: boolean } = {}) {
	const row = {
		id: newId(),
		name: 'Test Person',
		email: overrides.email ?? `${newId()}@example.org`,
		emailVerified: overrides.verified ?? true,
		image: null,
		twoFactorEnabled: false,
		locale: 'en',
		createdAt: NOW,
		updatedAt: NOW
	};
	db.insert(user).values(row).run();
	return row;
}

export function makeCommunity(
	db: Db,
	overrides: {
		slug?: string;
		status?: 'active' | 'suspended' | 'deleted';
		/** Decision references are year-stamped in it, so tests need to set it. */
		timezone?: string;
	} = {}
) {
	const row = {
		id: newId(),
		slug: overrides.slug ?? `community-${newId().slice(-8)}`,
		name: 'Valle Verde',
		locale: 'en',
		timezone: overrides.timezone ?? 'America/Guayaquil',
		status: overrides.status ?? ('active' as const),
		suspendedReason: null,
		deletedAt: null,
		publishNamesPolicy: 'roles_and_counts' as const,
		aiEnabled: false,
		gitMirrorEnabled: false,
		publicIndexEnabled: false,
		maxMembers: null,
		storageMb: null,
		aiMonthlyTokens: null,
		createdAt: NOW,
		updatedAt: NOW
	};
	db.insert(community).values(row).run();
	return row;
}

export function makeMembership(
	db: Db,
	communityId: string,
	userId: string,
	overrides: { role?: Role; isOwner?: boolean; ended?: boolean } = {}
) {
	const row = {
		id: newId(),
		communityId,
		userId,
		role: overrides.role ?? ('member' as Role),
		isOwner: overrides.isOwner ?? false,
		rcosState: 'full' as const,
		displayName: null,
		joinedAt: NOW,
		endedAt: overrides.ended ? NOW : null
	};
	db.insert(membership).values(row).run();
	return row;
}

/** Two communities with one member each — the shape every isolation test needs. */
export function makeTwoCommunities(db: Db) {
	const alice = makeUser(db, { email: 'alice@example.org' });
	const bob = makeUser(db, { email: 'bob@example.org' });
	const a = makeCommunity(db, { slug: 'community-a' });
	const b = makeCommunity(db, { slug: 'community-b' });
	makeMembership(db, a.id, alice.id, { role: 'steward', isOwner: true });
	makeMembership(db, b.id, bob.id, { role: 'steward', isOwner: true });
	return { alice, bob, a, b };
}
