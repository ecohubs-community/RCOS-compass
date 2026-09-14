import * as m from '$lib/paraglide/messages';
import type { Locale } from '$lib/paraglide/runtime';
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

const ROLE_MAIL: Record<
	'steward' | 'member',
	(community: string, options: { locale: Locale }) => [string, string]
> = {
	steward: (community, options) => [
		m.mail_role_steward_subject({ community }, options),
		m.mail_role_steward_body({ community }, options)
	],
	member: (community, options) => [
		m.mail_role_member_subject({ community }, options),
		m.mail_role_member_body({ community }, options)
	]
};

/** The notification kinds that are also sent as an email straight away, and removal. */
export type ImmediateMail =
	| { kind: 'consent.opened' }
	| { kind: 'consent.closing'; when: string }
	| { kind: 'membership.role_changed'; role: 'steward' | 'member' }
	| { kind: 'claim.withdrawn' }
	| { kind: 'removal' };

/**
 * A notification sent by email: a subject, one sentence, a link to what it is
 * about and a link to change what arrives. `openspec/changes/notifications-page`.
 *
 * In the community's language, because that is the language of everything the
 * link opens. The community's name is the only thing from inside it; `when` is
 * a date already formatted for the recipient. There is no parameter a title, a
 * post or a proposal could arrive through.
 */
export function notificationMessage(input: {
	to: string;
	mail: ImmediateMail;
	communityName: string;
	locale: Locale;
	url: string;
	/** Null for removal: a person who has left has no settings there to change. */
	preferencesUrl: string | null;
}): Message {
	const community = input.communityName;
	const options = { locale: input.locale };
	const mail = input.mail;
	const [subject, line] = (() => {
		switch (mail.kind) {
			case 'consent.opened':
				return [
					m.mail_consent_opened_subject({ community }, options),
					m.mail_consent_opened_body({ community }, options)
				];
			case 'consent.closing':
				return [
					m.mail_consent_closing_subject({ community }, options),
					m.mail_consent_closing_body({ community, when: mail.when }, options)
				];
			case 'membership.role_changed':
				// Which sentence, not what anyone may do: a lookup, like the in-app text.
				return ROLE_MAIL[mail.role](community, options);
			case 'claim.withdrawn':
				return [
					m.mail_claim_withdrawn_subject({ community }, options),
					m.mail_claim_withdrawn_body({ community }, options)
				];
			case 'removal':
				return [
					m.mail_removal_subject({ community }, options),
					m.mail_removal_body({ community }, options)
				];
		}
	})();

	const footer = input.preferencesUrl
		? ['', m.mail_preferences({ community }, options), input.preferencesUrl]
		: [];
	return {
		to: input.to,
		subject,
		text: [line, '', input.url, ...footer, '', `— ${SIGNATURE}`].join('\n'),
		url: input.url
	};
}
