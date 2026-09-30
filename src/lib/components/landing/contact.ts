/**
 * The landing page's two `mailto:` links, from `CONTACT_EMAIL`.
 *
 * Both are null without an address: a button that opens an empty mail draft
 * addressed to nobody is worse than no button, and the page still offers
 * sign-in to the people who already have an invitation.
 */
export function contactLinks(
	email: string,
	subject: string
): { contactHref: string | null; requestHref: string | null } {
	const address = email.trim();
	if (!address) return { contactHref: null, requestHref: null };
	return {
		contactHref: `mailto:${address}`,
		requestHref: `mailto:${address}?subject=${encodeURIComponent(subject)}`
	};
}
