import { getContext, setContext } from 'svelte';

/**
 * What every message on the thread screen needs from the page, without
 * passing it through each component between them.
 */
export type ThreadContext = {
	/** Members a mention can offer, for the edit box. */
	readonly members: readonly { token: string; label: string }[];
	/** The version on the panel, so a form ends where the reader was. */
	readonly version: number | null;
	/** The reader's own message open for editing, from `?edit=`. */
	readonly editing: string | null;
};

const KEY = Symbol('thread');

export const setThreadContext = (context: ThreadContext) => setContext(KEY, context);
export const threadContext = () => getContext<ThreadContext>(KEY);
