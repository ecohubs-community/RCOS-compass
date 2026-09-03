import { describe, expect, it } from 'vitest';
import {
	invitationMessage,
	invitationUrl,
	magicLinkMessage,
	verificationMessage
} from '../../src/lib/server/mail/messages.js';
import { memoryTransport, unconfiguredTransport } from '../../src/lib/server/mail/transport.js';

/**
 * docs/04-security.md §4: an email carries a link and a subject, never content.
 *
 * The composition functions are the enforcement point — no caller writes a body
 * — so this suite is where the rule is actually checked.
 */
const LINK = 'https://compass.example.org/invitations/a-token?c=valle-verde';

describe('what a message is allowed to say', () => {
	it('carries the link and the fixed copy, and nothing else', () => {
		const message = invitationMessage('marco@example.org', 'Valle Verde', LINK);

		expect(message.to).toBe('marco@example.org');
		expect(message.text).toContain(LINK);
		expect(message.url).toBe(LINK);
		// Plain text only: no HTML body to render differently than intended.
		expect(message).not.toHaveProperty('html');
	});

	it('names the community, because an invitation naming none is phishing', () => {
		const message = invitationMessage('marco@example.org', 'Valle Verde', LINK);
		expect(message.subject).toContain('Valle Verde');
		expect(message.text).toContain('Valle Verde');
	});

	it('says nothing about what the community has decided', () => {
		// The composition function takes no definition, post, proposal or
		// decision — this asserts the consequence: nothing governance-shaped can
		// reach a body even if a caller wanted it to.
		const message = invitationMessage('marco@example.org', 'Valle Verde', LINK);
		for (const leak of ['probation', 'Layer 1', 'DEC-2026', 'clause', 'adopted']) {
			expect(message.text.toLowerCase()).not.toContain(leak.toLowerCase());
		}
	});

	it('does not say who invited them or into what role', () => {
		// Both are facts about the community's membership; the acceptance page,
		// which is behind a link, is the right place for them.
		const message = invitationMessage('marco@example.org', 'Valle Verde', LINK);
		expect(message.text).not.toMatch(/steward|member|Ana|Marco/i);
	});

	it('composes a verification message with one instruction and one link', () => {
		const message = verificationMessage('ana@example.org', 'https://x.example/verify?t=1');
		expect(message.text).toContain('https://x.example/verify?t=1');
		expect(message.subject).toBe('Confirm your email address');
	});

	it('tells a magic-link recipient they can ignore one they did not ask for', () => {
		const message = magicLinkMessage('ana@example.org', 'https://x.example/magic?t=1');
		expect(message.text).toMatch(/did not ask for it/);
	});
});

describe('the invitation link', () => {
	it('escapes the token and names the community', () => {
		const url = new URL(invitationUrl('https://compass.example.org', 'valle-verde', 'a/b+c'));
		expect(url.pathname).toBe('/invitations/a%2Fb%2Bc');
		expect(url.searchParams.get('c')).toBe('valle-verde');
	});

	it('stays on the configured host rather than wherever it is called from', () => {
		const url = new URL(invitationUrl('https://compass.example.org', 'x', 't'));
		expect(url.origin).toBe('https://compass.example.org');
	});
});

describe('when no transport is configured', () => {
	it('refuses loudly rather than pretending', async () => {
		// A silent no-op would leave a steward watching an invitation that was
		// never sent, with nothing anywhere to say so.
		await expect(
			unconfiguredTransport.send(verificationMessage('ana@example.org', 'https://x.example/v'))
		).rejects.toThrow(/SMTP_URL/);
	});

	it('the memory transport keeps what it was given, for tests', async () => {
		const transport = memoryTransport();
		await transport.send(invitationMessage('marco@example.org', 'Valle Verde', LINK));
		expect(transport.sent).toHaveLength(1);
		expect(transport.sent[0]!.to).toBe('marco@example.org');
	});
});
