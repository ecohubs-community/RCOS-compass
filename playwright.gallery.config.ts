import { defineConfig, devices } from '@playwright/test';

/**
 * The component gallery is development-only, so it needs the dev server. Kept as
 * a second config rather than complicating the main one — and it means the
 * production run can assert the gallery is *absent* (tests/e2e/gallery.spec.ts).
 */
const PORT = 5199;

export default defineConfig({
	testDir: 'tests/gallery',
	fullyParallel: true,
	reporter: 'list',
	use: { baseURL: `http://localhost:${PORT}` },
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
		command: `pnpm vite dev --port ${PORT}`,
		port: PORT,
		reuseExistingServer: !process.env.CI,
		env: {
			BETTER_AUTH_SECRET: 'gallery-secret-that-is-long-enough',
			DATABASE_URL: 'file:./data/gallery.db',
			AI_PROVIDER: 'null',
			LOG_LEVEL: 'silent'
		}
	}
});
