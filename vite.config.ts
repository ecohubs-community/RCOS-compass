import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

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
		tailwindcss(),
		sveltekit()
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
