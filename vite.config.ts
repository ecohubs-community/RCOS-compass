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
	plugins: [envIntoProcessEnv(), tailwindcss(), sveltekit()],
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
					fileParallelism: true
				}
			}
		]
	}
});
