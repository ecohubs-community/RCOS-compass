import { consentRoundProvider } from './consent-round.js';
import type { VotingProvider } from './provider.js';

export * from './provider.js';
export { openRoundFor } from './consent-round.js';

let override: VotingProvider | null = null;

/**
 * The provider a community votes through.
 *
 * One implementation today, and the interface exists anyway: VoteCast slots in
 * post-MVP without touching the freeze, because the freeze consumes a `Tally`
 * and never a round (UI spec §5.2). When a second provider arrives this reads a
 * per-community setting; until then, returning the default is the whole of it.
 */
export function getVotingProvider(): VotingProvider {
	return override ?? consentRoundProvider;
}

/** Test seam, and the proof that a second provider needs no other change. */
export function setVotingProviderForTests(provider: VotingProvider | null): void {
	override = provider;
}
