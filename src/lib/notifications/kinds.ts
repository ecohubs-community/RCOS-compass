/**
 * Every kind of notification, and what each carries to be shown.
 * UI spec §4.11; `openspec/changes/notifications-page`.
 *
 * Shared by the server that writes a notification and the screen that shows
 * it, so both agree on a kind's values by type. A notification stores these
 * values — never a finished sentence — and is worded when shown, in the
 * community's language at that moment.
 *
 * People are membership ids (`actor`), turned into a label by the server when a
 * list is loaded; a name is never stored.
 */
export type NotificationParams = {
	'proposal.posted': { title: string };
	'consent.opened': { title: string };
	'consent.closing': { title: string; closesAt: number };
	'decision.frozen': { title: string; ref: string };
	'definition.review_due': { title: string };
	'export.ready': Record<string, never>;
	'document.scan_ended':
		| { filename: string; outcome: 'complete'; open: number }
		| { filename: string; outcome: 'stopped'; reason: string };
	'discussion.reply': { title: string; count: number };
	'discussion.mention': { title: string; actor: string };
	'discussion.quiet': { title: string };
	'membership.role_changed': { role: 'steward' | 'member' };
	'claim.withdrawn': Record<string, never>;
};

export type NotificationKind = keyof NotificationParams;

export type SubjectType =
	'discussion' | 'decision' | 'definition' | 'export' | 'document' | 'community';

/** Every kind, for tests that must cover each one and for the digest's counts. */
export const NOTIFICATION_KINDS = [
	'proposal.posted',
	'consent.opened',
	'consent.closing',
	'decision.frozen',
	'definition.review_due',
	'export.ready',
	'document.scan_ended',
	'discussion.reply',
	'discussion.mention',
	'discussion.quiet',
	'membership.role_changed',
	'claim.withdrawn'
] as const satisfies readonly NotificationKind[];

/**
 * One notification as a screen receives it. `params` and `summary` are absent
 * when the subject is gone or no longer visible to this member: a title that was
 * visible when it was written must not outlive the member's right to see it.
 */
export type NotificationItem = {
	id: string;
	kind: string;
	subjectType: string;
	createdAt: number;
	unread: boolean;
	available: boolean;
	params: Record<string, unknown> | null;
	summary: string | null;
	/** The label of the membership in `params.actor`, resolved through `personLabel`. */
	actor: string | null;
};
