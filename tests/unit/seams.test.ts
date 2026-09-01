import { describe, expect, it } from 'vitest';
import {
	fixtureProvider,
	nullProvider,
	AiUnavailableError
} from '../../src/lib/server/ai/index.js';
import { memoryTransport, unconfiguredTransport } from '../../src/lib/server/mail/index.js';

const request = {
	task: 'lint-definition',
	system: 'you are a linter',
	input: 'some draft',
	maxOutputTokens: 100
} as const;

describe('the null AI provider', () => {
	it('is what CI runs with, and reports itself unavailable', () => {
		expect(nullProvider.available).toBe(false);
	});

	it('refuses loudly rather than returning an empty result a caller might trust', async () => {
		await expect(nullProvider.complete(request)).rejects.toBeInstanceOf(AiUnavailableError);
	});

	it('names the manual path in its message', async () => {
		await expect(nullProvider.complete(request)).rejects.toThrow(/manual path/);
	});
});

describe('the fixture AI provider', () => {
	it('replays a recorded response', async () => {
		const provider = fixtureProvider({
			'lint-definition': { text: 'ok', usage: { in: 1, out: 1 }, model: 'fixture' }
		});
		await expect(provider.complete(request)).resolves.toMatchObject({ text: 'ok' });
	});

	it('refuses an unrecorded task rather than inventing one', async () => {
		await expect(fixtureProvider({}).complete(request)).rejects.toThrow(/No fixture recorded/);
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
