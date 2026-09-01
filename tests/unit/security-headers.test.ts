import { describe, expect, it } from 'vitest';
import { securityHeaders } from '../../src/lib/server/http/security-headers.js';
import { cspDirectives as maybeDirectives } from '../../svelte.config.js';

// The export is typed as optional by KitConfig; it is always present here, and a
// missing CSP is itself a failure worth asserting.
const cspDirectives = maybeDirectives!;

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
		const relaxed = Object.entries(cspDirectives).filter(([, values]) =>
			(values as string[]).includes('unsafe-inline')
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
