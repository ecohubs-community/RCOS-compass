import { defineConfig, devices } from '@playwright/test';

/**
 * docs/06-testing-strategy.md §2: e2e runs against a real production build, with
 * a deterministic environment and no network. §7 of the component guidelines
 * makes mobile a supported surface, so the viewport matrix is not optional.
 */
const PORT = 4173;

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	/**
	 * Bounded, because the fixture is expensive on purpose.
	 *
	 * `/__test/seed` builds a community through the application's own paths —
	 * two real sign-ups at production hashing cost — so a worker per core means
	 * ten of those at once against one node process, and the connection resets
	 * before the hash finishes. Five viewport projects made that reachable; four
	 * workers keeps the wall-clock while leaving the server able to answer.
	 */
	workers: process.env.CI ? 2 : 4,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure'
	},
	projects: [
		{
			name: 'desktop',
			grepInvert: /@no-js/,
			use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
		},
		{
			name: 'laptop',
			grepInvert: /@no-js/,
			use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } }
		},
		{
			name: 'tablet',
			grepInvert: /@no-js/,
			use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } }
		},
		{ name: 'mobile', grepInvert: /@no-js/, use: { ...devices['Pixel 7'] } },
		/**
		 * "Works without JavaScript" as a test rather than a claim. Runs only the
		 * tests tagged `@no-js`, and only here — with scripts on, those tests would
		 * pass for the wrong reason. They must not call `visit()`, which waits for
		 * hydration that never comes; plain `page.goto` is the point.
		 */
		{
			name: 'no-js',
			grep: /@no-js/,
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1440, height: 900 },
				javaScriptEnabled: false
			}
		},
		/**
		 * 375 pixels, which is the width the roadmap actually asked for and which
		 * nothing has ever run at: `Pixel 7` is 412. It is the narrowest phone
		 * anybody still uses, and the width where a table stops fitting.
		 *
		 * Scoped to the journeys and the scans rather than the whole suite: a fifth
		 * project running all 265 tests would add minutes to every run to re-prove
		 * things that do not depend on the viewport.
		 */
		{
			name: 'mobile-small',
			testMatch: /(loop|a11y|path-order|original-view)\.spec\.ts/,
			grepInvert: /@no-js/,
			/**
			 * The width written down, not a device preset that happens to be near
			 * it: Playwright's `iPhone SE` is 320 *and* WebKit, which would test a
			 * different width in a browser engine this project does not otherwise
			 * install. Chromium with mobile emulation at exactly 375.
			 */
			use: { ...devices['Pixel 7'], viewport: { width: 375, height: 667 } }
		}
	],
	webServer: {
		command: 'node build/index.js',
		port: PORT,
		reuseExistingServer: !process.env.CI,
		env: {
			PORT: String(PORT),
			NODE_ENV: 'production',
			// Without this the server assumes http://localhost and refuses every
			// form submission as cross-site — which is what these specs exercise.
			ORIGIN: `http://localhost:${PORT}`,
			PUBLIC_APP_URL: `http://localhost:${PORT}`,
			BETTER_AUTH_SECRET: 'e2e-secret-that-is-long-enough-to-pass',
			DATABASE_URL: 'file:./data/e2e.db',
			AI_PROVIDER: 'null',
			ALLOW_TEST_ROUTES: '1',
			// The production default, so the suite runs against the body ceiling a
			// deployment actually has — the 5 MB upload spec exists to meet it.
			BODY_SIZE_LIMIT: '26M',
			/**
			 * Four browser projects share one loopback address, so the real
			 * credential ceiling (10 per 15 minutes) would be spent by the sign-in
			 * specs themselves rather than by anything under test. The ceiling is
			 * proved in tests/integration/rate-limit-request.ts, where the clock is
			 * controlled; here it only needs to be out of the way.
			 */
			AUTH_ATTEMPTS_PER_15MIN: '500',
			// Same reasoning for the general ceiling: 145 specs across four projects
			// come from one loopback address inside a minute, so 300/min is spent by
			// the suite rather than by anything under test. Proved in the same
			// integration test, against a clock that does not move on its own.
			REQUESTS_PER_MINUTE: '20000',
			LOG_LEVEL: 'silent',
			BUILD_SHA: 'e2e'
		}
	}
});
