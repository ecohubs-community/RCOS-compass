/**
 * The shapes a linter finding and a linter result can take.
 *
 * Here rather than in `$lib/server/linter` because the panel is a component and
 * a component may never import from the server (docs/02-component-guidelines.md
 * §4). The rules themselves stay on the server: they are the part with a spec.
 */

export type Severity = 'blocker_shaped' | 'note' | 'ok';

export type Finding = {
	rule: string;
	severity: Severity;
	message: string;
	/** The offending words, when there are some to point at. */
	span?: string;
	/**
	 * Which line this is about, zero-based. Absent for a finding about the whole
	 * body — the two assisted rules read the text as a whole and have no line to
	 * point at.
	 */
	line?: number;
	/**
	 * What a person could do about it, where there is more than one honest
	 * answer. The ambiguous middle's three are the reason this exists: binding a
	 * line, marking it as a value and cutting it are different governance acts,
	 * and the linter offers all three rather than choosing.
	 */
	remedies?: Remedy[];
};

export type Remedy = 'make_enforceable' | 'label_non_binding' | 'delete_line';

/** What a line is for. `docs/11-definition-linter.md` §2. */
export type LineJob = 'enforceable' | 'interpretive' | 'expressive';

/**
 * How a line's job was arrived at.
 *
 * Recorded rather than assumed, because an inferred `expressive` on a line that
 * actually binds is worse than no label at all — it tells a reader the line is
 * safe to ignore. Only `inferred` is produced today; `declared` exists so that
 * author-set labels can land later without a second result shape.
 */
export type JobSource = 'declared' | 'inferred';

export type LintedLine = {
	/** The sentence, as it reads. */
	text: string;
	/** Null where the linter could not place it. Never a default. */
	job: LineJob | null;
	source: JobSource;
	findings: Finding[];
};

/**
 * The shape of a stored result, stamped.
 *
 * Results are persisted against the version they judged and read back by screens
 * written later. Without a stamp, a reader built for this shape would meet the
 * flat arrays stored before it and render an empty annotation — which looks
 * exactly like "this definition is clean", the worst thing a linter can say by
 * accident.
 */
export const LINT_SHAPE = 2;

export type LintResult = {
	shape: typeof LINT_SHAPE;
	lines: LintedLine[];
	/** Findings about the whole body rather than any one line. */
	bodyFindings: Finding[];
	/** The strongest job present among labelled lines. Derived, never chosen. */
	primaryJob: LineJob | null;
	/** True when nothing is `blocker_shaped`. Advice, never a gate. */
	clean: boolean;
	/** When this ran, so a screen can say so and a re-run can replace it. */
	ranAt: number;
};

/** The flat shape stored before per-line results existed. */
export type LegacyLintResult = { findings: Finding[]; clean: boolean };

export type StoredLint = LintResult | LegacyLintResult;

/**
 * A stored result, only if it is one this code can annotate.
 *
 * Anything without the stamp was written by the flat linter and describes a
 * body, not lines. It is still readable as prose findings; it is not something
 * to draw beside individual sentences.
 */
export function isCurrentShape(stored: unknown): stored is LintResult {
	return (
		typeof stored === 'object' &&
		stored !== null &&
		(stored as { shape?: unknown }).shape === LINT_SHAPE
	);
}

/** Every finding in a result, whichever shape it is in. */
export function allFindings(stored: StoredLint): Finding[] {
	if (isCurrentShape(stored)) {
		return [...stored.bodyFindings, ...stored.lines.flatMap((line) => line.findings)];
	}
	return stored.findings;
}
