/**
 * Time is injectable. docs/06-testing-strategy.md §2.1: services take `now()`
 * rather than calling `Date.now()`, because decision references are year-stamped
 * in the community's timezone and "stalled 12 days" is user-visible — both are
 * untestable against a wall clock.
 */
export type Clock = { now: () => number };

export const systemClock: Clock = { now: () => Date.now() };

/** A clock frozen at a fixed instant, advanceable by hand. */
export function fixedClock(startMs: number): Clock & { advance: (ms: number) => void } {
	let current = startMs;
	return {
		now: () => current,
		advance: (ms: number) => {
			current += ms;
		}
	};
}
