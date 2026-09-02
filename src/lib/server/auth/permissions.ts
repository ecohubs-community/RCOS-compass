import type { Role } from '../db/schema/tenancy.js';

/**
 * The permission matrix. docs/04-security.md §1.
 *
 * One literal map, and one function that reads it. Nothing else compares a role:
 * a handler that writes `if (role === 'steward')` is a second copy of this
 * matrix that will drift from it, and the drift is a security bug rather than a
 * style problem. An ESLint rule enforces that, and the whole table is asserted
 * in tests, so a capability added without an entry fails the build.
 *
 * The line the two roles divide along: **a member can do everything that
 * produces a proposal, and nothing that produces authority.** Freeze is not a
 * member right even where the community's own rule says the assembly decides —
 * the freeze is the act of *recording*, and someone has to be accountable for
 * the record.
 */
export const CAPABILITIES = [
	// Reading
	'community.read',
	'discussion.read',
	// Proposing — anything a member may do
	'discussion.create',
	'discussion.comment',
	'proposal.create',
	'definition.draft',
	'objection.raise',
	'consent.respond',
	'document.upload',
	'mapping.confirm',
	'ai.run',
	'path.reorder.private',
	'feedback.record',
	// Recording — authority
	'consent.open',
	'decision.freeze',
	'objection.resolve',
	'definition.ratify',
	'document.destroy',
	'path.publish',
	'artifact.publish',
	'audit.run',
	'exception.create',
	'exception.read',
	'localArtifact.manage',
	'feedback.share',
	'member.invite',
	'member.manage',
	'settings.manage',
	'community.export',
	// Owner only
	'community.transfer',
	'community.delete'
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Which roles hold each capability. `owner` is a flag, handled separately. */
const MATRIX: Record<Capability, readonly Role[]> = {
	'community.read': ['steward', 'member'],
	'discussion.read': ['steward', 'member'],

	'discussion.create': ['steward', 'member'],
	'discussion.comment': ['steward', 'member'],
	'proposal.create': ['steward', 'member'],
	'definition.draft': ['steward', 'member'],
	'objection.raise': ['steward', 'member'],
	'consent.respond': ['steward', 'member'],
	// Uploading and confirming a mapping produce Evidence — "we have language
	// about this" — not an adopted definition. Gatekeeping them would strangle
	// the one onboarding flow that works.
	'document.upload': ['steward', 'member'],
	'mapping.confirm': ['steward', 'member'],
	'ai.run': ['steward', 'member'],
	// Any member may drag the Path into their own order and see what it implies;
	// only a steward publishes that order for everyone.
	'path.reorder.private': ['steward', 'member'],
	'feedback.record': ['steward', 'member'],

	'consent.open': ['steward'],
	'decision.freeze': ['steward'],
	'objection.resolve': ['steward'],
	'definition.ratify': ['steward'],
	// Replacing or removing a document invalidates other people's confirmed
	// evidence, which is why destruction is a steward act and upload is not.
	'document.destroy': ['steward'],
	'path.publish': ['steward'],
	'artifact.publish': ['steward'],
	'audit.run': ['steward'],
	'exception.create': ['steward'],
	'exception.read': ['steward'],
	'localArtifact.manage': ['steward'],
	'feedback.share': ['steward'],
	'member.invite': ['steward'],
	'member.manage': ['steward'],
	'settings.manage': ['steward'],
	'community.export': ['steward'],

	// The owner flag is checked in addition to the role; see `can`.
	'community.transfer': ['steward'],
	'community.delete': ['steward']
};

/** Capabilities that additionally require the owner flag. */
const OWNER_ONLY: ReadonlySet<Capability> = new Set(['community.transfer', 'community.delete']);

/**
 * The owner flag only ever sits on a steward: the owner is accountable for
 * transfer and deletion, and a member cannot perform either. Exported so that
 * rule lives here with the rest of the role knowledge rather than as a literal
 * comparison somewhere else.
 */
export const OWNER_ROLE: Role = 'steward';

export function ownerRoleIsValid(role: Role): boolean {
	return role === OWNER_ROLE;
}

export type Actor = {
	role: Role;
	isOwner: boolean;
};

export function can(actor: Actor | null, capability: Capability): boolean {
	if (!actor) return false;
	if (OWNER_ONLY.has(capability) && !actor.isOwner) return false;
	return MATRIX[capability].includes(actor.role);
}

export function capabilitiesOf(actor: Actor | null): Capability[] {
	return CAPABILITIES.filter((capability) => can(actor, capability));
}

/** Exported for the matrix test, which asserts every pair. */
export const PERMISSION_MATRIX = MATRIX;
export const OWNER_ONLY_CAPABILITIES = OWNER_ONLY;
