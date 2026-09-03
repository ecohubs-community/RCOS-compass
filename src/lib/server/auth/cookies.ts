import type { Cookies } from '@sveltejs/kit';

/**
 * The bridge between better-auth and SvelteKit's cookie jar.
 *
 * Writes go through form actions (docs/01-server-client-contract.md §1), and an
 * action cannot set a response header. better-auth, called with
 * `asResponse: true`, hands back a `Response` whose `Set-Cookie` headers carry
 * the session — so they are parsed here and re-issued through `cookies.set`,
 * which is the only channel an action has.
 *
 * The one subtlety worth stating: the value is re-issued **verbatim**.
 * SvelteKit's `set` percent-encodes by default, and better-auth reads its own
 * cookies with its own parser; a value that goes out encoded twice comes back
 * decoded once and no longer matches the signature.
 */

export type ParsedCookie = {
	name: string;
	value: string;
	options: {
		path: string;
		domain?: string;
		expires?: Date;
		maxAge?: number;
		httpOnly?: boolean;
		secure?: boolean;
		sameSite?: 'lax' | 'strict' | 'none';
	};
};

/** Parse one `Set-Cookie` header value. Returns null for anything unusable. */
export function parseSetCookie(header: string): ParsedCookie | null {
	const [pair, ...attributes] = header.split(';');
	if (!pair) return null;

	const separator = pair.indexOf('=');
	if (separator < 1) return null;

	const name = pair.slice(0, separator).trim();
	const value = pair.slice(separator + 1).trim();
	if (name.length === 0) return null;

	// A cookie with no Path applies to the current directory; every cookie
	// better-auth sets is root-scoped, and SvelteKit requires the path anyway.
	const options: ParsedCookie['options'] = { path: '/' };

	for (const attribute of attributes) {
		const index = attribute.indexOf('=');
		const key = (index === -1 ? attribute : attribute.slice(0, index)).trim().toLowerCase();
		const raw = index === -1 ? '' : attribute.slice(index + 1).trim();

		switch (key) {
			case 'path':
				if (raw) options.path = raw;
				break;
			case 'domain':
				if (raw) options.domain = raw;
				break;
			case 'max-age': {
				const seconds = Number(raw);
				if (Number.isFinite(seconds)) options.maxAge = seconds;
				break;
			}
			case 'expires': {
				const date = new Date(raw);
				if (!Number.isNaN(date.getTime())) options.expires = date;
				break;
			}
			case 'httponly':
				options.httpOnly = true;
				break;
			case 'secure':
				options.secure = true;
				break;
			case 'samesite': {
				const mode = raw.toLowerCase();
				if (mode === 'lax' || mode === 'strict' || mode === 'none') options.sameSite = mode;
				break;
			}
			default:
				// Partitioned, Priority and anything else a future browser adds are
				// dropped rather than guessed at.
				break;
		}
	}

	return { name, value, options };
}

/** Re-issue every cookie in a better-auth response through SvelteKit. */
export function applyAuthCookies(response: Response, cookies: Cookies): void {
	for (const header of response.headers.getSetCookie()) {
		const parsed = parseSetCookie(header);
		if (!parsed) continue;
		cookies.set(parsed.name, parsed.value, {
			...parsed.options,
			// Verbatim: see the note above.
			encode: (value) => value
		});
	}
}
