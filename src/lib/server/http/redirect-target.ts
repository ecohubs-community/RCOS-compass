/**
 * Where to send someone after they sign in.
 *
 * The target arrives in a query string, so it is attacker-controlled: an open
 * redirect here would let a phishing link carry a real, correct sign-in page and
 * still land the victim somewhere else. Only a path on this site is accepted,
 * and anything else falls back.
 */
export function safeRedirectTarget(raw: string | null | undefined, fallback = '/'): string {
	if (!raw) return fallback;
	// A leading `//` or `/\` is a protocol-relative URL to another host.
	if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
	// Control characters and whitespace are how a URL parser is talked into
	// seeing a scheme that is not written down. Checked by code point rather than
	// by a character class, so the intent survives reading.
	for (let i = 0; i < raw.length; i += 1) {
		if (raw.charCodeAt(i) <= 0x20) return fallback;
	}
	return raw;
}

/**
 * The destination a person asked for, or `null` when they asked for none.
 *
 * Kept apart from {@link safeRedirectTarget}'s fallback on purpose: "no
 * destination" lands somewhere chosen for the person (`landingFor`), while an
 * explicit `/` — the landing page's own Sign in — still means the front page.
 * An unsafe value counts as asked-for and falls back to `/`, as before.
 */
export function askedTarget(raw: string | null | undefined): string | null {
	return raw ? safeRedirectTarget(raw) : null;
}
