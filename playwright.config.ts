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
			use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
		},
		{
			name: 'laptop',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } }
		},
		{
			name: 'tablet',
			use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } }
		},
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	],
	webServer: {
		command: 'node build/index.js',
		port: PORT,
		reuseExistingServer: !process.env.CI,
		env: {
			PORT: String(PORT),
			NODE_ENV: 'production',
			BETTER_AUTH_SECRET: 'e2e-secret-that-is-long-enough-to-pass',
			DATABASE_URL: 'file:./data/e2e.db',
			AI_PROVIDER: 'null',
			ALLOW_TEST_ROUTES: '1',
			LOG_LEVEL: 'silent',
			BUILD_SHA: 'e2e'
		}
	}
});
