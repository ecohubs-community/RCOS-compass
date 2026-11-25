import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import Icons from 'unplugin-icons/vite';
import { sveltekit, type Config } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { pdfjsAssets } from './scripts/vite-pdfjs-assets.mjs';

/**
 * Put `.env` where the application actually looks for it.
 *
 * Vite loads `.env` into `import.meta.env`, and SvelteKit exposes it through
 * `$env/*` — but neither writes to `process.env`, and `src/lib/server/config.ts`
 * reads `process.env` deliberately, because it is also read by scripts and by
 * tests that never boot SvelteKit.
 *
 * Without this, `pnpm dev` starts, serves one request, and dies with
 * "BETTER_AUTH_SECRET is required" beside a perfectly good `.env` — the same
 * trap that `pnpm preview` fell into, from the same cause: only Node's own
 * `--env-file` populates `process.env`, and `vite dev` is not a plain `node`.
 *
 * A real environment variable wins over the file, matching `--env-file` exactly
 * (checked, not assumed), so dev, preview and production agree about precedence.
 */
function envIntoProcessEnv(): Plugin {
	return {
		name: 'compass:env-into-process-env',
		config(_config, { mode }) {
			for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
				process.env[key] ??= value;
			}
		}
	};
}

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
		// The original PDF view parses files in a Web Worker. Under 'strict-dynamic'
		// browsers ignore 'self' in script-src, and worker-src falls back to it — so
		// without this a same-origin worker is refused. It allows exactly our own
		// origin, and script-src gains nothing.
		'worker-src': ['self'],
		'object-src': ['none'],
		'frame-ancestors': ['none'],
		'base-uri': ['self'],
		'form-action': ['self']
	}
} satisfies Config['csp'];

export default defineConfig({
	plugins: [
		envIntoProcessEnv(),
		/**
		 * Compiled message functions, not a runtime dictionary. A key that no
		 * locale defines is a build error rather than a blank on a screen, and a
		 * locale nobody loaded ships no bytes.
		 *
		 * `strategy` is deliberately short: the community's locale is a column on
		 * `community`, resolved server-side per request, so there is nothing to
		 * negotiate from a header or a cookie. The URL is not part of it either —
		 * a community's address is its slug, and adding a locale segment would
		 * give every page two URLs.
		 */
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['custom-server', 'baseLocale']
		}),
		/**
		 * Tabler icons, compiled to Svelte components at build time.
		 *
		 * Build time rather than the Iconify API: `connect-src 'self'` blocks the
		 * icon endpoint, and a nav whose icons depend on a third party being up is
		 * a nav that is sometimes blank. Only the icons actually imported are
		 * bundled, so the set costs what it uses.
		 */
		Icons({ compiler: 'svelte' }),
		tailwindcss(),
		pdfjsAssets(),
		sveltekit({
			preprocess: vitePreprocess(),
			// Path-based tenancy on one origin: docs/00-architecture.md §7. No subdomain
			// routing, so no wildcard TLS and no cookie-scoping games. SvelteKit checks
			// the Origin header on form actions by default.
			adapter: adapter(),
			csp
		})
	],
	test: {
		// Determinism: docs/06-testing-strategy.md §2.1. No shared state between
		// suites, UTC everywhere, and nothing reaches the network.
		//
		// A valid baseline environment so no suite needs shell setup before it can
		// import anything — a harness people have to prepare is a harness people
		// route around.
		env: {
			NODE_ENV: 'test',
			BETTER_AUTH_SECRET: 'test-secret-that-is-long-enough-for-tests',
			DATABASE_URL: 'file:./data/vitest.db',
			AI_PROVIDER: 'null',
			/**
			 * Empty on purpose, and stated rather than assumed.
			 *
			 * The no-network guard replaces `fetch`, which nodemailer does not use —
			 * it opens a socket. So a developer who set `SMTP_URL` to a local mail
			 * catcher had every `signUpEmail` in the integration suite deliver a real
			 * verification message to it: thirty-odd mails per run, each carrying a
			 * link whose token lives in a throwaway test database and therefore
			 * answers INVALID_TOKEN. Unset here, `getMailTransport()` hands back the
			 * transport that refuses, which is what a test wants anyway.
			 */
			SMTP_URL: '',
			LOG_LEVEL: 'silent',
			TZ: 'UTC'
		},
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: ['tests/unit/**/*.test.ts'],
					setupFiles: ['tests/setup/unit.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'integration',
					environment: 'node',
					include: ['tests/integration/**/*.test.ts'],
					setupFiles: ['tests/setup/integration.ts'],
					// Each suite owns its own database file; they may still run in parallel.
					fileParallelism: true,
					/**
					 * The auth suites hash passwords at production cost, on purpose —
					 * a sign-up and a sign-in inside one test, several suites at once,
					 * and the default five seconds is a coin toss on a busy machine.
					 * Raised rather than made cheaper: a fast hash would pass this
					 * suite and weaken the thing it is testing.
					 */
					testTimeout: 30_000
				}
			}
		]
	}
});
