<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/components/ui/cn.js';

	/** The miniature of the app's status chip, as the tour draws it. */
	let { tone, children }: { tone: 'attention' | 'info' | 'accent'; children: Snippet } = $props();

	const tones = {
		attention: ['bg-attention-subtle text-attention-fg', 'bg-attention'],
		info: ['bg-info-subtle text-info-fg', 'bg-info-fg'],
		accent: ['bg-accent-subtle text-accent-fg', 'bg-accent-fg']
	};
</script>

<span
	class={cn(
		'inline-flex items-center gap-1.5 rounded-[5px] px-2 py-0.5 text-[11px]',
		tones[tone][0]
	)}
>
	<span class={cn('size-1.25 rounded-full', tones[tone][1])}></span>
	{@render children()}
</span>
