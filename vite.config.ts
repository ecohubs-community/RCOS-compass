import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
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
