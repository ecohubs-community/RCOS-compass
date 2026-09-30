<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/components/ui/cn.js';

	/**
	 * One question a community ends up asking, and what answers it. `big` cards
	 * span two columns; `dark` is the forest variant.
	 */
	let {
		name,
		question,
		text,
		big = false,
		dark = false,
		children
	}: {
		name: string;
		question: string;
		text: string;
		big?: boolean;
		dark?: boolean;
		/** The little specimen at the bottom of the card. */
		children: Snippet;
	} = $props();
</script>

<article
	class={cn(
		'flex flex-col rounded-[22px]',
		big ? 'gap-4.5 p-7 min-[920px]:col-span-2' : 'gap-3 p-6',
		dark ? 'bg-forest text-forest-fg' : 'border-site-line bg-site-card border'
	)}
>
	<h3 class={cn('text-[13px] font-semibold', dark ? 'text-mint' : 'text-site-green')}>{name}</h3>
	<p
		class={cn(
			'font-display',
			big ? 'text-[30px] leading-[1.15] tracking-[-.01em]' : 'text-[23px] leading-[1.2]'
		)}
	>
		{question}
	</p>
	<p
		class={cn(
			'leading-[1.55]',
			big ? 'max-w-115 text-base' : 'text-[15px]',
			dark ? 'text-forest-muted' : 'text-site-ink-2'
		)}
	>
		{text}
	</p>
	<div class="flex-1"></div>
	{@render children()}
</article>
