import { describe, expect, it } from 'vitest';
import {
	canMarkDone,
	mappingStateOf,
	SCAN_STALL_MS,
	scanIsStalled,
	type MappingInput
} from '../../src/lib/server/services/mapping-state.js';

/**
 * Every row of the state table, and each consequence the change's design names
 * as a test. The table is the contract the library chip and the workspace header
 * share; a row that drifts here drifts on both screens at once.
 */
const base: MappingInput = {
	status: 'extracted',
	scanStatus: 'none',
	scanStalled: false,
	identified: 0,
	open: 0,
	doneAt: null
};
const at = (overrides: Partial<MappingInput>) => mappingStateOf({ ...base, ...overrides });

describe('the mapping state table, first match wins', () => {
	it.each([
		['uploaded', 'reading'],
		['extracting', 'reading'],
		['failed', 'could_not_read'],
		['reference_only', 'cannot_scan']
	] as const)('a %s document is %s, whatever its scan says', (status, state) => {
		expect(at({ status, scanStatus: 'complete', identified: 3 }).state).toBe(state);
	});

	it('a live scan is scanning', () => {
		expect(at({ scanStatus: 'queued' }).state).toBe('scanning');
		expect(at({ scanStatus: 'running', identified: 4, open: 2 }).state).toBe('scanning');
	});

	it('an untouched document is not scanned, and offers to start', () => {
		expect(at({})).toEqual({ state: 'not_scanned', primaryAction: 'start' });
	});

	it('a finished scan that found nothing is not governance', () => {
		expect(at({ scanStatus: 'complete' }).state).toBe('not_governance');
	});

	it('a finished scan with everything answered is mapped', () => {
		expect(at({ scanStatus: 'complete', identified: 9, open: 0 })).toEqual({
			state: 'mapped',
			primaryAction: 'review'
		});
	});

	it('anything else is in progress, and offers to continue', () => {
		expect(at({ scanStatus: 'complete', identified: 9, open: 1 })).toEqual({
			state: 'in_progress',
			primaryAction: 'continue'
		});
	});
});

describe('the consequences the design names', () => {
	it('one paragraph mapped by hand is in progress, not mapped', () => {
		expect(at({ identified: 1, open: 0 }).state).toBe('in_progress');
	});

	it('marking done makes a hand-mapped document mapped', () => {
		expect(at({ identified: 3, open: 0, doneAt: 1 }).state).toBe('mapped');
	});

	it('a done mark does not hide a suggestion still open', () => {
		expect(at({ identified: 3, open: 1, doneAt: 1 }).state).toBe('in_progress');
	});

	it('a stopped scan with nothing open is in progress, not mapped', () => {
		expect(at({ scanStatus: 'stopped', identified: 2, open: 0 }).state).toBe('in_progress');
	});

	it('a stopped scan that found nothing yet is in progress, not governance', () => {
		expect(at({ scanStatus: 'stopped' }).state).toBe('in_progress');
	});

	it('a stalled scan reads as stopped', () => {
		expect(at({ scanStatus: 'running', scanStalled: true }).state).toBe('in_progress');
	});
});

describe('stall and mark-done', () => {
	it('stalls only a queued or running scan whose heartbeat is older than the threshold', () => {
		const now = 1_000_000_000;
		const old = new Date(now - SCAN_STALL_MS - 1);
		const fresh = new Date(now - 1000);
		expect(scanIsStalled({ scanStatus: 'running', scanHeartbeatAt: old }, now)).toBe(true);
		expect(scanIsStalled({ scanStatus: 'queued', scanHeartbeatAt: null }, now)).toBe(true);
		expect(scanIsStalled({ scanStatus: 'running', scanHeartbeatAt: fresh }, now)).toBe(false);
		expect(scanIsStalled({ scanStatus: 'stopped', scanHeartbeatAt: old }, now)).toBe(false);
	});

	it('offers mark-done only with something identified, nothing open and no live scan', () => {
		expect(canMarkDone({ ...base, identified: 2 })).toBe(true);
		expect(canMarkDone({ ...base, identified: 0 })).toBe(false);
		expect(canMarkDone({ ...base, identified: 2, open: 1 })).toBe(false);
		expect(canMarkDone({ ...base, identified: 2, scanStatus: 'running' })).toBe(false);
		expect(canMarkDone({ ...base, identified: 2, doneAt: 5 })).toBe(false);
		expect(canMarkDone({ ...base, identified: 2, scanStatus: 'complete' })).toBe(false);
	});
});
