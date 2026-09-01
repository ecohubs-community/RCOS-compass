import { describe, expect, it } from 'vitest';

/**
 * docs/06-testing-strategy.md §2.1. The guard is installed by the setup file for
 * every project; this asserts it is actually in force, because a guard nobody
 * verifies is a guard that gets removed by accident.
 */
describe('the no-network guard', () => {
	it('fails any test that reaches the network', async () => {
		await expect(fetch('https://example.org')).rejects.toThrow(/Network access from a test/);
	});

	it('names the fix in its message', async () => {
		await expect(fetch('https://example.org')).rejects.toThrow(/Stub it at the interface/);
	});
});
