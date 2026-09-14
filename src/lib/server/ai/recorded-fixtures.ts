import { MAP_DOCUMENT_PROMPT_VERSION } from './prompts/map-document.js';
import type { Fixtures } from './fixture-provider.js';

/**
 * What `AI_PROVIDER=fixture` answers — the provider the AI e2e run uses
 * (`playwright.ai.config.ts`), so the mapping flow can be driven end to end
 * with no network and the same answer every time.
 *
 * Recorded against prompt version 2 (reason and excerpt). It points passage 2
 * of every batch at §3.6.2, exit and separation, which is what the Valle Verde
 * bylaws fixture's second paragraph — "A member may leave at any time…" —
 * actually speaks to. Changing it is a reviewed act, like any fixture.
 */
if (MAP_DOCUMENT_PROMPT_VERSION !== 2) {
	throw new Error('The recorded map-document fixture answers prompt v2; re-record it.');
}

export const RECORDED_FIXTURES: Fixtures = {
	'map-document': {
		ok: true,
		text: JSON.stringify({
			pairs: [
				{
					passage: 2,
					requirement: '3.6.2',
					confidence: 85,
					reason:
						'Says how a member leaves and when their share is settled, but not what happens to shared tools.',
					excerpt: 'A member may leave at any time by telling a steward in writing'
				}
			]
		}),
		usage: { in: 800, out: 60 },
		model: 'fixture'
	}
};
