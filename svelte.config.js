import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Content-Security-Policy directives. docs/04-security.md §7.
 *
 * Defined here rather than in hooks because SvelteKit has to know them: it
 * nonces its own hydration script, and a hand-rolled header would block the app
 * it is protecting. One source of truth, asserted in tests/unit/csp.test.ts.
 *
 * `unsafe-inline` never appears. This app renders community-authored text and,
 * later, model output — an XSS here is an attacker editing a governance record.
 */
/** @type {import('@sveltejs/kit').KitConfig['csp'] & {}} */
const csp = {
	mode: 'nonce',
	directives: {
		'default-src': ['self'],
		'script-src': ['self', 'strict-dynamic'],
		'style-src': ['self'],
		// SvelteKit's client runtime sets style *attributes* on elements (scroll
		// restoration, transitions). A style attribute cannot execute script, and
		// naming this directive explicitly means it no longer falls back to
		// style-src — so inline <style> blocks stay blocked. This is the only
		// relaxation in the policy, and script-src is untouched by it.
		'style-src-attr': ['unsafe-inline'],
		'img-src': ['self', 'data:', 'blob:'],
		'font-src': ['self'],
		'connect-src': ['self'],
		'object-src': ['none'],
		'frame-ancestors': ['none'],
		'base-uri': ['self'],
		'form-action': ['self']
	}
};

/** Exported for tests/unit/security-headers.test.ts. */
export const cspDirectives = csp.directives;

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// Path-based tenancy on one origin: docs/00-architecture.md §7. No subdomain
		// routing, so no wildcard TLS and no cookie-scoping games. SvelteKit checks
		// the Origin header on form actions by default.
		adapter: adapter(),
		csp
	}
};
