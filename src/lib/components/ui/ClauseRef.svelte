<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn } from './cn.js';

	/**
	 * The one thing that prints a clause reference (AGENTS.md, "Clause IDs are a
	 * triple"). Always the section number a member reads in the standard —
	 * `§3.6.2` — and never the stable key, which is for foreign keys and was
	 * showing up in thread headers as `l1.exit-and-separation.1`.
	 *
	 * `related` marks a clause the section only references rather than answers.
	 * It is said by weight and style as well as colour, and the caller puts the
	 * word "related" in front of the group, so colour is never the only signal.
	 *
	 * With `href` it is a link; `onclick` lets a page open something better than
	 * the link (the requirement sheet) while the link stays the path that works
	 * with no JavaScript.
	 */
	type Props = {
		ref: string;
		href?: string;
		related?: boolean;
		selected?: boolean;
		onclick?: HTMLAnchorAttributes['onclick'];
		class?: string;
	};

	let {
		ref,
		href,
		related = false,
		selected = false,
		onclick,
		class: className = ''
	}: Props = $props();

	const classes = $derived(
		cn(
			'whitespace-nowrap',
			related ? 'text-fg-muted italic' : 'text-fg-secondary',
			selected && 'text-fg font-medium underline decoration-2 underline-offset-2',
			className
		)
	);
</script>

{#if href}
	<!--
		eslint-disable svelte/no-navigation-without-resolve --
		The caller passes a `links.*` value, which is a `resolve` with an anchor
		appended; the rule reads the attribute and cannot see that.
	-->
	<a
		{href}
		{onclick}
		data-tabular
		class="{classes} hover:text-fg underline underline-offset-2"
		aria-current={selected ? 'true' : undefined}>§{ref}</a
	>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
{:else}
	<span data-tabular class={classes}>§{ref}</span>
{/if}
