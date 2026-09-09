import { describe, expect, it } from 'vitest';
import { getMailTransport } from '../../src/lib/server/mail/index.js';

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

	/**
	 * Mail leaves by socket, not by `fetch`, so the guard above never saw it.
	 * It went unnoticed for as long as nobody ran a mail catcher on the machine
	 * the tests run on — and the day somebody did, a test run posted a verification
	 * mail for every account any suite created.
	 */
	it('leaves no way for a suite to send mail', async () => {
		const transport = getMailTransport();

		expect(transport.id).toBe('unconfigured');
		await expect(
			transport.send({ to: 'ops@example.org', subject: 'x', text: 'x' })
		).rejects.toThrow(/No mail transport configured/);
	});
});
