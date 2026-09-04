import { describe, expect, it } from 'vitest';
import { fixtureProvider, nullProvider, NO_PROVIDER } from '../../src/lib/server/ai/index.js';
import { memoryTransport, unconfiguredTransport } from '../../src/lib/server/mail/index.js';

const request = {
	task: 'lint-definition',
	system: 'you are a linter',
	input: 'some draft',
	maxOutputTokens: 100
} as const;

/**
 * The seam's contract changed in P4, and these tests changed with it.
 *
 * It used to reject with `AiUnavailableError`, which was right while the only
 * way to be unavailable was "no provider configured" — a boot-time fact.
 * Budgets made unavailability *ordinary*: the most engaged member in a
 * community reaches their daily allowance mid-afternoon, and what they should
 * meet is a sentence about the manual path, not a 500 from a `catch` somebody
 * forgot. So it is a result now, and the type makes the case unskippable.
 */
describe('the null AI provider', () => {
	it('answers with a result rather than throwing', async () => {
		const result = await nullProvider.complete(request);
		expect(result.ok).toBe(false);
	});

	it('names the manual path, because that is what the member should do next', async () => {
		const result = await nullProvider.complete(request);
		expect(result.ok === false && result.reason).toBe(NO_PROVIDER);
		expect(NO_PROVIDER).toMatch(/by hand/);
	});

	it('reports no tokens spent, because none were', async () => {
		const result = await nullProvider.complete(request);
		expect(result.usage).toEqual({ in: 0, out: 0 });
	});
});

describe('the fixture AI provider', () => {
	it('replays a recorded response', async () => {
		const provider = fixtureProvider({
			'lint-definition': { ok: true, text: 'ok', usage: { in: 1, out: 1 }, model: 'fixture' }
		});
		await expect(provider.complete(request)).resolves.toMatchObject({ ok: true, text: 'ok' });
	});

	it('refuses an unrecorded task rather than inventing one', async () => {
		const result = await fixtureProvider({}).complete(request);
		expect(result.ok).toBe(false);
		expect(result.ok === false && result.reason).toMatch(/No fixture recorded/);
		// Not retryable: running it again replays the same absence.
		expect(result.ok === false && result.retryable).toBe(false);
	});
});

describe('mail', () => {
	it('captures messages in memory for tests', async () => {
		const transport = memoryTransport();
		await transport.send({ to: 'ana@example.org', subject: 'You were invited', text: 'Open it' });
		expect(transport.sent).toHaveLength(1);
	});

	it('refuses to send when nothing is configured, rather than silently dropping', async () => {
		await expect(
			unconfiguredTransport.send({ to: 'a@example.org', subject: 'x', text: 'y' })
		).rejects.toThrow(/No mail transport configured/);
	});
});
