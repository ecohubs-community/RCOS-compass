import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Merges a component's own classes with the caller's `class` prop, caller last.
 * docs/02-component-guidelines.md §3.
 *
 * The custom font-size tokens have to be declared. Without this, tailwind-merge
 * cannot tell `text-body` (a size) from `text-white` (a colour), treats them as
 * the same group, and silently drops one — which is how a button loses its text
 * colour and fails contrast. Found by the accessibility test, not by reading.
 */
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			'font-size': [{ text: ['meta', 'body', 'title', 'section', 'page'] }]
		}
	}
});

export function cn(...classes: (string | false | null | undefined)[]): string {
	return twMerge(classes.filter(Boolean).join(' '));
}
