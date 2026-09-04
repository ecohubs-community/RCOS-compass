/**
 * The shapes a linter finding can take.
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
};
