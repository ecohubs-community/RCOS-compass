import { expect, test } from '@playwright/test';

/**
 * The component gallery is dev-only, so this suite runs against the dev server.
 * It is skipped in the production-build run rather than silently passing.
 */
test.describe('component gallery', () => {
	test('is not served by a production build', async ({ request }) => {
		expect((await request.get('/dev/components')).status()).toBe(404);
	});
});
