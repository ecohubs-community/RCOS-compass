import type { Message } from './transport.js';

/**
 * Every message the platform sends, composed in one place.
 *
 * The rule this module exists to enforce: **an email carries a link and a
 * subject, never content.** An inbox sits outside every visibility control the
 * application has — it is forwarded, synced to phones, read by mail providers,
 * and kept long after someone leaves a community. A digest that quotes a
 * definition has published that definition to an audience nobody consented to.
 *
 * So bodies are written here, from fixed copy plus a URL, and never from
 * governance text. Nothing takes a definition, a post, a proposal or a decision
 * as a parameter, which is what makes the rule checkable rather than merely
 * stated (docs/04-security.md §4, UI spec §4.11).
 */

/** The fixed footer, so no message has to remember to explain itself. */
const SIGNATURE = 'RCOS Compass';

function compose(subject: string, lines: readonly string[], url: string): Message {
	return {
		to: '',
		subject,
		text: [...lines, '', url, '', `— ${SIGNATURE}`].join('\n'),
		url
	};
}

/** Confirm an address at sign-up. Until this is followed, almost nothing works. */
export function verificationMessage(to: string, url: string): Message {
	return {
		...compose(
			'Confirm your email address',
			['Open this link to confirm your address and finish signing in.'],
			url
		),
		to
	};
}

/** Sign in without a password — friendlier for a group that signs in rarely. */
export function magicLinkMessage(to: string, url: string): Message {
	return {
		...compose(
			'Your sign-in link',
			[
				'Open this link to sign in. It works once and expires shortly.',
				'If you did not ask for it, you can ignore this message.'
			],
			url
		),
		to
	};
}

/**
 * An invitation to a community.
 *
 * The community's *name* is the only thing from inside a community that appears
 * in a message, and it appears because an invitation naming no community is
 * indistinguishable from phishing. Nothing else crosses: not who invited them,
 * not the role, not a word of what the community has decided.
 */
export function invitationMessage(to: string, communityName: string, url: string): Message {
	return {
		...compose(
			`You have been invited to ${communityName} on RCOS Compass`,
			[
				`Someone at ${communityName} invited you to join their RCOS Compass workspace.`,
				'Open this link to accept. It works once, for this address, and expires in seven days.'
			],
			url
		),
		to
	};
}

/** The link an invited person follows. Built here so the shape has one owner. */
export function invitationUrl(appUrl: string, slug: string, token: string): string {
	const url = new URL(`/invitations/${encodeURIComponent(token)}`, appUrl);
	url.searchParams.set('c', slug);
	return url.toString();
}
