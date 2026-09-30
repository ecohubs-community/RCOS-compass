<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/components/ui/cn.js';
	import type { Place } from '../reveal.js';

	/**
	 * One screen of the tour. Every screen occupies the same grid cell, so the
	 * window is as tall as the tallest of them and nothing jumps as they
	 * crossfade — no measuring, and the same on every width.
	 */
	let { place, children }: { place: Place; children: Snippet } = $props();
</script>

<div
	class={cn(
		'relative flex min-w-0 flex-col gap-4 p-5 transition-[opacity,translate] duration-500 [grid-area:1/1] @2xl:px-7.5 @2xl:py-6.5',
		place === 'current' && 'translate-y-0 opacity-100',
		place === 'before' && '-translate-y-3 opacity-0',
		place === 'after' && 'translate-y-3 opacity-0'
	)}
	inert={place !== 'current'}
>
	{@render children()}
</div>
