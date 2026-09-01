/**
 * Response headers other than CSP. docs/04-security.md §7.
 *
 * CSP itself lives in svelte.config.js: SvelteKit has to own it so that it can
 * nonce its own hydration script. Splitting them is deliberate — a second,
 * hand-written CSP here would silently override that one and break hydration.
 */
export type SecurityHeaderOptions = {
	isProduction: boolean;
};

export function securityHeaders({ isProduction }: SecurityHeaderOptions): Record<string, string> {
	const headers: Record<string, string> = {
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'same-origin',
		'X-Frame-Options': 'DENY',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()'
	};

	if (isProduction) {
		headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
	}

	return headers;
}
