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
			testMatch:
				/(loop|a11y|path-order|path-items|layer-checks|definition-provenance|artifact-detail|round-view|original-view)\.spec\.ts/,
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
		/**
		 * From an empty database and upload folder, every run: what an earlier run
		 * left in the job queue decided whether the document specs passed.
		 * `scripts/e2e-server.mjs`. A server reused outside CI keeps its database;
		 * stop it for a clean run.
		 */
		command: 'node scripts/e2e-server.mjs',
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
			// Its own, so a run never writes into the development server's uploads,
			// and the reset above can empty it without touching them.
			UPLOAD_DIR: './data/e2e-uploads',
			AI_PROVIDER: 'null',
			// So the landing page's "Request pilot access" links exist to be tested.
			CONTACT_EMAIL: 'pilot@example.org',
			ALLOW_TEST_ROUTES: '1',
			// The production default, so the suite runs against the body ceiling a
			// deployment actually has — the 5 MB upload spec exists to meet it.
			BODY_SIZE_LIMIT: '26M',
			/**
			 * Every project shares one loopback address, and nearly every test seeds
			 * its own community and signs in as its people — a sign-in per test is
			 * the suite's shape, not something a saved session could replace. So the
			 * real credential ceiling (10 per 15 minutes) would be spent by the suite
			 * rather than by anything under test. The ceiling itself is proved in
			 * tests/integration/rate-limit-request.test.ts, against a controlled
			 * clock; here it only needs to be out of the way.
			 *
			 * The arithmetic, measured on 2026-09-25 from `rate_limit_bucket`: a full
			 * run makes 565 credential POSTs in about 11 minutes — all of them inside
			 * one 15-minute window. The old ceiling of 500 therefore refused the last
			 * ~40 tests of every full run. 5000 holds a full run nearly nine times
			 * over: room for the suite to grow, and for a second run against a reused
			 * server (`reuseExistingServer` outside CI keeps the database, and with it
			 * the count) inside the same window.
			 */
			AUTH_ATTEMPTS_PER_15MIN: '5000',
			// Same reasoning for the general ceiling: a full run peaks at about 1100
			// requests a minute from the one address (measured with the above), so
			// the real 300/min is spent by the suite rather than by anything under
			// test. Proved in the same integration test.
			REQUESTS_PER_MINUTE: '20000',
			LOG_LEVEL: 'silent',
			BUILD_SHA: 'e2e'
		}
	}
});
