import { describe, expect, it } from 'vitest';
import { SEAL_LABELS, seal, unseal } from '../../src/lib/server/crypto/sealed.js';

/**
 * One derived key per purpose. `openspec/changes/pilot-blockers` D3: the join
 * link is sealed under its own label so it can be shown to a steward again, and
 * must never open as — or be opened by — the mirror's credential key.
 */
describe('sealing under a label', () => {
	it('opens what it sealed, under each label', () => {
		for (const label of Object.values(SEAL_LABELS)) {
			expect(unseal(seal('a secret', label), label)).toBe('a secret');
		}
	});

	it('does not open a join link under the mirror label, or the other way round', () => {
		expect(unseal(seal('join', SEAL_LABELS.joinLink), SEAL_LABELS.mirrorCredential)).toBeNull();
		expect(unseal(seal('mirror', SEAL_LABELS.mirrorCredential), SEAL_LABELS.joinLink)).toBeNull();
	});

	it('keeps the mirror as the default, so credentials sealed before labels still open', () => {
		expect(unseal(seal('token'), SEAL_LABELS.mirrorCredential)).toBe('token');
		expect(unseal(seal('token', SEAL_LABELS.mirrorCredential))).toBe('token');
	});
});
