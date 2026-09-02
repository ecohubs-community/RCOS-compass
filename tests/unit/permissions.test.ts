import { describe, expect, it } from 'vitest';
import {
	CAPABILITIES,
	OWNER_ONLY_CAPABILITIES,
	PERMISSION_MATRIX,
	can,
	capabilitiesOf,
	type Actor,
	type Capability
} from '../../src/lib/server/auth/permissions.js';

const steward: Actor = { role: 'steward', isOwner: false };
const owner: Actor = { role: 'steward', isOwner: true };
const member: Actor = { role: 'member', isOwner: false };

/**
 * The whole matrix, asserted pair by pair. docs/04-security.md §1.
 *
 * This table is the specification: if it disagrees with the code, one of them is
 * a security bug, and the point of writing it out in full is that changing a
 * permission requires changing it here too — deliberately, in a diff someone
 * reviews.
 */
const EXPECTED: Record<Capability, { steward: boolean; member: boolean; ownerOnly?: boolean }> = {
	'community.read': { steward: true, member: true },
	'discussion.read': { steward: true, member: true },

	'discussion.create': { steward: true, member: true },
	'discussion.comment': { steward: true, member: true },
	'proposal.create': { steward: true, member: true },
	'definition.draft': { steward: true, member: true },
	'objection.raise': { steward: true, member: true },
	'consent.respond': { steward: true, member: true },
	'document.upload': { steward: true, member: true },
	'mapping.confirm': { steward: true, member: true },
	'ai.run': { steward: true, member: true },
	'path.reorder.private': { steward: true, member: true },
	'feedback.record': { steward: true, member: true },

	'consent.open': { steward: true, member: false },
	'decision.freeze': { steward: true, member: false },
	'objection.resolve': { steward: true, member: false },
	'definition.ratify': { steward: true, member: false },
	'document.destroy': { steward: true, member: false },
	'path.publish': { steward: true, member: false },
	'artifact.publish': { steward: true, member: false },
	'audit.run': { steward: true, member: false },
	'exception.create': { steward: true, member: false },
	'exception.read': { steward: true, member: false },
	'localArtifact.manage': { steward: true, member: false },
	'feedback.share': { steward: true, member: false },
	'member.invite': { steward: true, member: false },
	'member.manage': { steward: true, member: false },
	'settings.manage': { steward: true, member: false },
	'community.export': { steward: true, member: false },

	'community.transfer': { steward: false, member: false, ownerOnly: true },
	'community.delete': { steward: false, member: false, ownerOnly: true }
};

describe('the permission matrix', () => {
	it('has an expectation for every capability, and no more', () => {
		// If this fails, a capability was added or removed without updating the
		// table above — which is exactly the moment to think about who may use it.
		expect(Object.keys(EXPECTED).sort()).toEqual([...CAPABILITIES].sort());
	});

	it.each(CAPABILITIES)('steward: %s', (capability) => {
		expect(can(steward, capability)).toBe(EXPECTED[capability].steward);
	});

	it.each(CAPABILITIES)('member: %s', (capability) => {
		expect(can(member, capability)).toBe(EXPECTED[capability].member);
	});

	it.each(CAPABILITIES)('owner: %s', (capability) => {
		const expected = EXPECTED[capability];
		expect(can(owner, capability)).toBe(expected.ownerOnly === true || expected.steward);
	});

	it('every capability names at least one role', () => {
		for (const capability of CAPABILITIES) {
			expect(PERMISSION_MATRIX[capability].length, capability).toBeGreaterThan(0);
		}
	});
});

describe('the line the roles divide along', () => {
	it('lets a member do everything that produces a proposal', () => {
		for (const capability of [
			'discussion.create',
			'proposal.create',
			'definition.draft',
			'objection.raise',
			'consent.respond',
			'document.upload',
			'mapping.confirm'
		] as Capability[]) {
			expect(can(member, capability), capability).toBe(true);
		}
	});

	it('lets a member do nothing that produces authority', () => {
		for (const capability of [
			'decision.freeze',
			'consent.open',
			'definition.ratify',
			'artifact.publish',
			'member.invite',
			'settings.manage',
			'path.publish'
		] as Capability[]) {
			expect(can(member, capability), capability).toBe(false);
		}
	});

	it('separates uploading a document from destroying one', () => {
		// Confirming a mapping creates Evidence, not an adopted definition, so the
		// blast radius is small. Replacing or removing a document invalidates other
		// people's confirmed evidence, so it is not.
		expect(can(member, 'document.upload')).toBe(true);
		expect(can(member, 'mapping.confirm')).toBe(true);
		expect(can(member, 'document.destroy')).toBe(false);
	});

	it('separates re-ordering the Path privately from publishing that order', () => {
		expect(can(member, 'path.reorder.private')).toBe(true);
		expect(can(member, 'path.publish')).toBe(false);
	});
});

describe('the owner flag', () => {
	it('is required for transfer and deletion, even for a steward', () => {
		for (const capability of OWNER_ONLY_CAPABILITIES) {
			expect(can(steward, capability), capability).toBe(false);
			expect(can(owner, capability), capability).toBe(true);
		}
	});

	it('grants nothing to a member who somehow carries it', () => {
		// The flag is additive, never a substitute for the role.
		const ownerMember: Actor = { role: 'member', isOwner: true };
		expect(can(ownerMember, 'community.delete')).toBe(false);
		expect(can(ownerMember, 'decision.freeze')).toBe(false);
	});

	it('does not widen an owner beyond a steward elsewhere', () => {
		const stewardCaps = capabilitiesOf(steward);
		const ownerCaps = capabilitiesOf(owner);
		expect(ownerCaps.filter((c) => !stewardCaps.includes(c)).sort()).toEqual(
			[...OWNER_ONLY_CAPABILITIES].sort()
		);
	});
});

describe('no actor', () => {
	it('can do nothing at all', () => {
		for (const capability of CAPABILITIES) {
			expect(can(null, capability), capability).toBe(false);
		}
	});
});
