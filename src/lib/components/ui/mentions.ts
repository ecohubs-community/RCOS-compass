import { getContext, setContext } from 'svelte';

/**
 * Who a `@M-0142` names, for the governance text below the component that sets
 * it. `openspec/changes/notifications-page`.
 *
 * Context rather than a prop, because `InlineText` sits under `Markdown`, lists
 * and quotes, and threading a map through every level would touch every place
 * that renders text for the sake of the one screen that has mentions. Where no
 * map is set, a mention renders as the number written.
 */
const KEY = Symbol('mention-labels');

export type MentionLabels = () => Readonly<Record<number, string>>;

export function setMentionLabels(labels: MentionLabels): void {
	setContext(KEY, labels);
}

/** Called while a component initialises; the returned function may be called any time. */
export function mentionLabels(): (seq: number) => string | null {
	const labels = getContext<MentionLabels | undefined>(KEY);
	return (seq) => labels?.()[seq] ?? null;
}
