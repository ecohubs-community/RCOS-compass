import { join } from 'node:path';
import { loadConfig } from '@sveltejs/load-config';
import type { Config } from '@sveltejs/kit/vite';
import { describe, expect, it } from 'vitest';
import { securityHeaders } from '../../src/lib/server/http/security-headers.js';

// The policy SvelteKit is actually handed: read through the same loader the
// tooling uses, from the options passed to `sveltekit(...)` in vite.config.ts.
const loaded = await loadConfig(join(import.meta.dirname, '../..'), { traverse: false });
if (!loaded || 'error' in loaded) throw new Error('vite.config.ts did not load');
// A missing CSP is itself a failure worth asserting.
const cspDirectives = (loaded.config as Config).csp!.directives!;

describe('content security policy', () => {
	const flat = JSON.stringify(cspDirectives);

	it('never allows inline or eval script', () => {
		expect(cspDirectives['script-src']).not.toContain('unsafe-inline');
		expect(cspDirectives['script-src']).not.toContain('unsafe-eval');
		expect(flat).not.toContain('unsafe-eval');
	});

	it('blocks inline <style> blocks while permitting runtime style attributes', () => {
		// The one relaxation in the policy. A style attribute cannot execute
		// script; naming style-src-attr explicitly keeps inline <style> blocked.
		expect(cspDirectives['style-src']).toEqual(['self']);
		expect(cspDirectives['style-src-attr']).toEqual(['unsafe-inline']);
	});

	it('relaxes nothing else', () => {
		// SvelteKit fills in every directive it knows; unset ones are not lists.
		const relaxed = Object.entries(cspDirectives).filter(
			([, values]) => Array.isArray(values) && values.includes('unsafe-inline')
		);
		expect(relaxed.map(([name]) => name)).toEqual(['style-src-attr']);
	});

	it('locks down the directives that matter for an app rendering authored text', () => {
		expect(cspDirectives['default-src']).toEqual(['self']);
		expect(cspDirectives['object-src']).toEqual(['none']);
		expect(cspDirectives['frame-ancestors']).toEqual(['none']);
		expect(cspDirectives['base-uri']).toEqual(['self']);
		expect(cspDirectives['form-action']).toEqual(['self']);
	});

	it('does not permit third-party script or connect origins', () => {
		expect(cspDirectives['script-src']).not.toContain('*');
		expect(cspDirectives['connect-src']).toEqual(['self']);
	});

	/**
	 * The original PDF view (`document-original-view`) parses files in a Worker.
	 * `worker-src 'self'` is the one addition it needs; `script-src` must not grow
	 * to make room for it — no `unsafe-*`, `wasm-unsafe-eval` included, and no host.
	 */
	it('allows workers from our own origin, and script-src gains nothing for them', () => {
		expect(cspDirectives['worker-src']).toEqual(['self']);
		expect(cspDirectives['script-src']).toEqual(['self', 'strict-dynamic']);
		for (const source of cspDirectives['script-src'] ?? []) {
			expect(source).not.toMatch(/^unsafe-|unsafe-eval|:\/\/|\./);
		}
	});
});

describe('security headers', () => {
	it('sets nosniff, same-origin referrer and frame denial on every response', () => {
		const headers = securityHeaders({ isProduction: false });
		expect(headers['X-Content-Type-Options']).toBe('nosniff');
		expect(headers['Referrer-Policy']).toBe('same-origin');
		expect(headers['X-Frame-Options']).toBe('DENY');
		expect(headers['Permissions-Policy']).toContain('camera=()');
	});

	it('adds HSTS in production only', () => {
		expect(securityHeaders({ isProduction: true })['Strict-Transport-Security']).toContain(
			'max-age='
		);
		expect(securityHeaders({ isProduction: false })['Strict-Transport-Security']).toBeUndefined();
	});
});
