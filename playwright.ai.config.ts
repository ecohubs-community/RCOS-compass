import { defineConfig, devices } from '@playwright/test';

/**
 * The same loop, with a provider present.
 *
 * `AI_PROVIDER=null` is what the main run uses and what CI runs, because the
 * manual path is the product. This second configuration exists to prove the
 * converse: that having a provider does not *change* the loop. If the documents
 * spec passes here and there, then nothing in it quietly depends on AI, and
 * nothing about AI quietly breaks the path that must work without it.
 *
 * The `fixture` provider has no recorded responses, so every AI call answers
 * "unavailable" — which is exactly the state a real instance spends most of its
 * time in, between a member's budget and a provider's bad afternoon.
 */
const PORT = 4174;

export default defineConfig({
	testDir: 'tests/e2e',
	testMatch: 'documents.spec.ts',
	fullyParallel: true,
	reporter: 'list',
	use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
	projects: [
		{
			name: 'desktop',
			// The no-JS project lives in playwright.config.ts; here those tests would pass with scripts on.
			grepInvert: /@no-js/,
			use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
		},
		{ name: 'mobile', grepInvert: /@no-js/, use: { ...devices['Pixel 7'] } }
	],
	webServer: {
		command: 'node build/index.js',
		port: PORT,
		reuseExistingServer: !process.env.CI,
		env: {
			PORT: String(PORT),
			NODE_ENV: 'production',
			ORIGIN: `http://localhost:${PORT}`,
			PUBLIC_APP_URL: `http://localhost:${PORT}`,
			BETTER_AUTH_SECRET: 'e2e-secret-that-is-long-enough-to-pass',
			DATABASE_URL: 'file:./data/e2e-ai.db',
			// The one line this whole configuration exists for.
			AI_PROVIDER: 'fixture',
			ALLOW_TEST_ROUTES: '1',
			// The production ceiling, as in playwright.config.ts: the config refuses to start without it.
			BODY_SIZE_LIMIT: '26M',
			AUTH_ATTEMPTS_PER_15MIN: '500',
			REQUESTS_PER_MINUTE: '20000',
			LOG_LEVEL: 'silent',
			BUILD_SHA: 'e2e-ai'
		}
	}
});
