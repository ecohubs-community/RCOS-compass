import * as m from '$lib/paraglide/messages';
import type { NotificationItem, NotificationParams } from './kinds.js';

const ROLE_SENTENCE: Record<NotificationParams['membership.role_changed']['role'], () => string> = {
	steward: m.notification_role_steward,
	member: m.notification_role_member
};

/**
 * A notification's words, in the language the page is shown in.
 * `openspec/changes/notifications-page`.
 *
 * Built from the stored kind and values each time, so a community that changes
 * its language reads its old notifications in the new one. A row written before
 * values were stored shows its English summary; a notification whose subject is
 * gone or no longer visible shows only that — never the title it once carried.
 *
 * `when` formats a deadline (the consent round's close) in the reader's zone;
 * the caller passes the page's formatter so this module stays free of `page`.
 */
export function notificationText(
	item: Pick<NotificationItem, 'kind' | 'params' | 'summary' | 'available' | 'actor'>,
	when: (ms: number) => string
): string {
	if (!item.available) return m.notification_gone();
	const params = item.params;
	if (!params) return item.summary ?? m.notification_gone();

	const p = <K extends keyof NotificationParams>() => params as NotificationParams[K];
	switch (item.kind) {
		case 'proposal.posted':
			return m.notification_proposal_posted({ title: p<'proposal.posted'>().title });
		case 'consent.opened':
			return m.notification_consent_opened({ title: p<'consent.opened'>().title });
		case 'consent.closing': {
			const closing = p<'consent.closing'>();
			return m.notification_consent_closing({ title: closing.title, when: when(closing.closesAt) });
		}
		case 'decision.frozen': {
			const frozen = p<'decision.frozen'>();
			return m.notification_decision_frozen({ ref: frozen.ref, title: frozen.title });
		}
		case 'definition.review_due':
			return m.notification_review_due({ title: p<'definition.review_due'>().title });
		case 'export.ready':
			return m.notification_export_ready();
		case 'document.scan_ended': {
			const scan = p<'document.scan_ended'>();
			if (scan.outcome === 'stopped') {
				return m.notification_scan_stopped({ filename: scan.filename, reason: scan.reason });
			}
			return scan.open === 1
				? m.notification_scan_complete_one({ filename: scan.filename })
				: m.notification_scan_complete_many({ filename: scan.filename, count: scan.open });
		}
		case 'discussion.reply': {
			const reply = p<'discussion.reply'>();
			return reply.count === 1
				? m.notification_reply_one({ title: reply.title })
				: m.notification_reply_many({ title: reply.title, count: reply.count });
		}
		case 'discussion.mention':
			return m.notification_mention({
				actor: item.actor ?? '',
				title: p<'discussion.mention'>().title
			});
		case 'discussion.quiet':
			return m.notification_quiet({ title: p<'discussion.quiet'>().title });
		case 'membership.role_changed':
			// Which sentence to show, not what anyone may do: a lookup rather than a
			// role comparison, which the security lint rightly refuses anywhere.
			return ROLE_SENTENCE[p<'membership.role_changed'>().role]();
		case 'claim.withdrawn':
			return m.notification_claim_withdrawn();
		default:
			return item.summary ?? m.notification_gone();
	}
}
