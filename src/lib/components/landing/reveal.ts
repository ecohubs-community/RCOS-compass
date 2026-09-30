/**
 * The landing page's one animation: something arriving from a little below.
 *
 * A class string rather than a transition directive, so it runs in both
 * directions when the tour loops or the reader scrolls back, and so it is
 * already in its resting state in the server-rendered page. The global
 * reduced-motion rule in `app.css` takes the movement out.
 */
export function reveal(shown: boolean, distance: 'near' | 'far' = 'near'): string {
	const hidden = distance === 'near' ? 'translate-y-2 opacity-0' : 'translate-y-7 opacity-0';
	return `transition-[opacity,translate] duration-500 ${shown ? 'translate-y-0 opacity-100' : hidden}`;
}

/** Where a crossfading panel sits relative to the one being shown. */
export type Place = 'before' | 'current' | 'after';

export function placeOf(index: number, current: number): Place {
	return index === current ? 'current' : index < current ? 'before' : 'after';
}
