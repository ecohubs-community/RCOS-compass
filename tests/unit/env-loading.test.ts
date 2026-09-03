import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every way the application is started must put `.env` where it looks for it.
 *
 * `src/lib/server/config.ts` reads `process.env`, deliberately — it is also read
 * by scripts and by tests that never boot SvelteKit. But **nothing populates
 * `process.env` for free**: Vite loads `.env` into `import.meta.env` and
 * SvelteKit exposes it through `$env/*`, and only Node's own `--env-file` writes
 * to `process.env`.
 *
 * That gap bit twice. `pnpm preview` refused to start with "BETTER_AUTH_SECRET
 * is required" beside a valid `.env`; then `pnpm dev` did the same, dying on the
 * first request. Both times the message pointed at the `.env`, which was correct
 * all along.
 *
 * `tests/unit/package-scripts.test.ts` covers the plain-`node` entry points.
 * This one covers the Vite ones, which need a plugin instead of a flag.
 */
const root = join(import.meta.dirname, '../..');
const viteConfig = readFileSync(join(root, 'vite.config.ts'), 'utf8');

describe('the Vite entry points load .env into process.env', () => {
	it('a plugin does it, because Vite does not', () => {
		expect(viteConfig).toMatch(/loadEnv\(/);
		expect(
			viteConfig,
			'the loaded values must reach process.env, not just import.meta.env'
		).toMatch(/process\.env\[/);
	});

	it('the plugin runs before SvelteKit', () => {
		// SvelteKit's own plugin reads configuration while resolving; the .env has
		// to be in place before it does.
		const plugins = viteConfig.slice(viteConfig.indexOf('plugins: ['));
		const ours = plugins.indexOf('envIntoProcessEnv');
		const kit = plugins.indexOf('sveltekit()');
		expect(ours).toBeGreaterThanOrEqual(0);
		expect(ours, 'the env plugin must come first in the plugins array').toBeLessThan(kit);
	});

	it('a real environment variable still wins over the file', () => {
		// This is what Node's --env-file does, checked rather than assumed, so dev,
		// preview and production agree about precedence. `??=` assigns only when
		// the key is absent; `=` would let a stale .env override a deploy.
		expect(viteConfig).toMatch(/process\.env\[[^\]]+\]\s*\?\?=/);
		expect(viteConfig).not.toMatch(/process\.env\[[^\]]+\]\s*=[^=]/);
	});
});

describe('a misconfigured dev server does not take itself down', () => {
	const hooks = readFileSync(join(root, 'src/hooks.server.ts'), 'utf8');

	it('throws in development and exits in production', () => {
		// A process that exits takes the dev server with it, so every attempt to
		// fix the .env costs a restart and the message scrolls away behind it.
		// Production is the opposite: an instance that boots misconfigured is one
		// that loses records later.
		expect(hooks).toMatch(
			/import\.meta\.env\.DEV\s*\?\s*getConfig\(\)\s*:\s*assertConfigOrExit\(\)/
		);
	});
});
