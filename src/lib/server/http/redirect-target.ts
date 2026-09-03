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
