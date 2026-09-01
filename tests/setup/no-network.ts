/**
 * docs/06-testing-strategy.md §2.1: no test reaches the network. AI, mail and the
 * git remote are stubbed at their interfaces; this is the backstop that catches
 * anything that slipped past one.
 */
export function installNoNetworkGuard(): void {
	globalThis.fetch = (async (input: RequestInfo | URL) => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
		throw new Error(
			`Network access from a test: ${url}\n` +
				'Stub it at the interface instead — docs/06-testing-strategy.md §2.1.'
		);
	}) as typeof fetch;
}
