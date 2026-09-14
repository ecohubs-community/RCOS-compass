/**
 * Where a document stands, as one pure function of numbers that already exist.
 * The `document-library` spec; `openspec/changes/document-mapping-workspace`.
 *
 * Derived rather than stored, and derived in exactly one place — the library and
 * the workspace both ask this, so the chip in a row and the header of the
 * document it opens cannot disagree. No database access: the counts come from
 * `mapping-counts.ts`, and every row of the table below is a unit test.
 *
 * | # | First match wins                                                    | State               |
 * |---|---------------------------------------------------------------------|---------------------|
 * | 1 | status uploaded / extracting                                        | reading             |
 * | 2 | status failed                                                       | could_not_read      |
 * | 3 | status reference_only                                               | cannot_scan         |
 * | 4 | scan queued / running, not stalled                                  | scanning            |
 * | 5 | nothing identified, never scanned                                   | not_scanned         |
 * | 6 | nothing identified, scan complete                                   | not_governance      |
 * | 7 | something identified, nothing open, scan complete or marked done   | mapped              |
 * | 8 | otherwise                                                           | in_progress         |
 *
 * `identified` counts paragraph passages with any non-stale evidence — a model's
 * suggestion or a person's own mapping — and `open` those still holding a
 * `suggested` row. So one paragraph mapped by hand is *in progress*, not mapped:
 * a document is only called mapped when a scan has read all of it, or a member
 * says they are done.
 */

export type DocumentStatus = 'uploaded' | 'extracting' | 'extracted' | 'reference_only' | 'failed';
export type ScanStatus = 'none' | 'queued' | 'running' | 'stopped' | 'complete';

export type MappingState =
	| 'reading'
	| 'could_not_read'
	| 'cannot_scan'
	| 'scanning'
	| 'not_scanned'
	| 'not_governance'
	| 'in_progress'
	| 'mapped';

export type PrimaryAction = 'start' | 'continue' | 'review' | 'open';

export type MappingInput = {
	status: DocumentStatus;
	scanStatus: ScanStatus;
	/** A queued or running scan whose heartbeat is older than `SCAN_STALL_MS`. */
	scanStalled: boolean;
	identified: number;
	open: number;
	doneAt: number | null;
};

/**
 * One batch of a dozen short paragraphs is well under a minute; ten minutes of
 * silence is a worker that died. A stalled scan reads as stopped and can be
 * claimed again — a false stall only lets someone start another scan, and the
 * content generation stops the old one writing.
 */
export const SCAN_STALL_MS = 10 * 60_000;

export function scanIsStalled(
	scan: { scanStatus: ScanStatus; scanHeartbeatAt: Date | null },
	now: number
): boolean {
	if (scan.scanStatus !== 'queued' && scan.scanStatus !== 'running') return false;
	const beat = scan.scanHeartbeatAt?.getTime() ?? 0;
	return now - beat > SCAN_STALL_MS;
}

/** A scan that is actually doing something right now. */
export function scanIsLive(input: Pick<MappingInput, 'scanStatus' | 'scanStalled'>): boolean {
	return (input.scanStatus === 'queued' || input.scanStatus === 'running') && !input.scanStalled;
}

export function mappingStateOf(input: MappingInput): {
	state: MappingState;
	primaryAction: PrimaryAction;
} {
	if (input.status === 'uploaded' || input.status === 'extracting') {
		return { state: 'reading', primaryAction: 'open' };
	}
	if (input.status === 'failed') return { state: 'could_not_read', primaryAction: 'open' };
	if (input.status === 'reference_only') return { state: 'cannot_scan', primaryAction: 'open' };
	if (scanIsLive(input)) return { state: 'scanning', primaryAction: 'open' };

	if (input.identified === 0 && input.scanStatus === 'none') {
		return { state: 'not_scanned', primaryAction: 'start' };
	}
	if (input.identified === 0 && input.scanStatus === 'complete') {
		return { state: 'not_governance', primaryAction: 'open' };
	}
	if (
		input.identified > 0 &&
		input.open === 0 &&
		(input.scanStatus === 'complete' || input.doneAt !== null)
	) {
		return { state: 'mapped', primaryAction: 'review' };
	}
	return { state: 'in_progress', primaryAction: 'continue' };
}

/** "Mark mapping as done" is offered — and accepted — exactly when this holds. */
export function canMarkDone(input: MappingInput): boolean {
	return (
		input.status === 'extracted' &&
		input.identified > 0 &&
		input.open === 0 &&
		!scanIsLive(input) &&
		mappingStateOf(input).state !== 'mapped'
	);
}
