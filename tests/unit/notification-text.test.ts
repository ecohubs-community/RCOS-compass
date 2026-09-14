import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KINDS, type NotificationParams } from '../../src/lib/notifications/kinds.js';
import { notificationText } from '../../src/lib/notifications/text.js';

/**
 * Every kind of notification can be worded, in every language the interface
 * speaks. `openspec/changes/notifications-page`.
 */
const SAMPLE: { [K in keyof NotificationParams]: NotificationParams[K] } = {
	'proposal.posted': { title: 'Exit and separation' },
	'consent.opened': { title: 'Exit and separation' },
	'consent.closing': { title: 'Exit and separation', closesAt: 0 },
	'decision.frozen': { title: 'Spending authority', ref: 'DEC-2026-004' },
	'definition.review_due': { title: 'Membership' },
	'export.ready': {},
	'document.scan_ended': { filename: 'bylaws.pdf', outcome: 'complete', open: 3 },
	'discussion.reply': { title: 'Exit and separation', count: 3 },
	'discussion.mention': { title: 'Exit and separation', actor: 'membership-1' },
	'discussion.quiet': { title: 'Exit and separation' },
	'membership.role_changed': { role: 'steward' },
	'claim.withdrawn': {}
};

const item = (kind: string, params: Record<string, unknown> | null, available = true) => ({
	kind,
	params,
	summary: 'The stored English line',
	available,
	actor: 'Ana Ruiz'
});

describe('a notification’s words', () => {
	it.each(NOTIFICATION_KINDS)('words %s from its values, not its stored summary', (kind) => {
		const text = notificationText(item(kind, SAMPLE[kind]), () => '18:00 WEST');
		expect(text.length).toBeGreaterThan(0);
		expect(text).not.toBe('The stored English line');
		expect(text).not.toBe('No longer available');
	});

	it('names the actor, counts replies and words the deadline in the reader’s zone', () => {
		expect(notificationText(item('discussion.mention', SAMPLE['discussion.mention']), String)).toBe(
			'Ana Ruiz mentioned you in “Exit and separation”'
		);
		expect(notificationText(item('discussion.reply', SAMPLE['discussion.reply']), String)).toBe(
			'3 new replies in “Exit and separation”'
		);
		expect(
			notificationText(item('consent.closing', SAMPLE['consent.closing']), () => '1 Mar, 18:00 WET')
		).toContain('closes 1 Mar, 18:00 WET');
	});

	it('shows a row from before values were stored by its summary', () => {
		expect(notificationText(item('decision.frozen', null), String)).toBe('The stored English line');
	});

	it('shows nothing of a subject that is gone or hidden', () => {
		const text = notificationText(
			item('decision.frozen', SAMPLE['decision.frozen'], false),
			String
		);
		expect(text).toBe('No longer available');
		expect(text).not.toContain('Spending authority');
	});

	it('has every notification message in English, German and Spanish', () => {
		const source = readFileSync(
			join(import.meta.dirname, '../../src/lib/notifications/text.ts'),
			'utf8'
		);
		const keys = [...new Set([...source.matchAll(/m\.(notification_[a-z_]+)/g)].map((m) => m[1]!))];
		expect(keys.length).toBeGreaterThan(10);
		for (const locale of ['en', 'de', 'es']) {
			const messages = JSON.parse(
				readFileSync(join(import.meta.dirname, `../../messages/${locale}.json`), 'utf8')
			) as Record<string, string>;
			for (const key of keys) expect(messages[key], `${key} in ${locale}`).toBeTruthy();
		}
	});
});
