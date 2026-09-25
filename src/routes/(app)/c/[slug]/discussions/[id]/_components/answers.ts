/**
 * The three answers to a round, drawn the same way wherever they appear — the
 * proposal card in the thread and the panel beside it.
 *
 * Abstain is grey rather than amber. Amber already means "needs attention"
 * across the app (the status chips, overdue reviews), and abstaining is the one
 * answer that asks nothing of anybody. The colour is never the only signal:
 * every place that uses these also prints the label.
 */
export type Answer = 'consent' | 'abstain' | 'objection';

export const ANSWERS: Answer[] = ['consent', 'abstain', 'objection'];

export const ANSWER: Record<
	Answer,
	{
		/** On a chip beside a name. */
		label: string;
		/** On a row of the tally, and on the button that gives it. */
		short: string;
		dot: string;
		bar: string;
		chip: string;
		/** The button, once it is your answer. */
		chosen: string;
	}
> = {
	consent: {
		label: 'Consent',
		short: 'Consent',
		dot: 'bg-accent-fg',
		bar: 'bg-accent',
		chip: 'border-accent/40',
		chosen: 'border-accent bg-accent-subtle text-accent-fg'
	},
	abstain: {
		label: 'Abstain',
		short: 'Abstain',
		dot: 'bg-fg-muted',
		bar: 'bg-fg-muted',
		chip: 'border-border-strong',
		chosen: 'border-fg-muted bg-raised text-fg'
	},
	objection: {
		label: 'Objection',
		short: 'Object',
		dot: 'bg-danger',
		bar: 'bg-danger',
		chip: 'border-danger/40',
		chosen: 'border-danger bg-danger-subtle text-fg'
	}
};

export const answerOf = (value: string | null | undefined) =>
	ANSWER[(value ?? '') as Answer] ?? ANSWER.abstain;

/** A round's state, in the words a member uses for it. */
export const ROUND_STATE: Record<string, string> = {
	open: 'In vote',
	closed: 'Round closed',
	superseded: 'Superseded',
	cancelled: 'Cancelled'
};
