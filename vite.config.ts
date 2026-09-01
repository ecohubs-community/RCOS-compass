import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	test: {
		// Determinism: docs/06-testing-strategy.md §2.1. No shared state between
		// suites, UTC everywhere, and nothing reaches the network.
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
