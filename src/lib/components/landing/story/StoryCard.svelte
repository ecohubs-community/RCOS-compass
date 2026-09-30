<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/components/ui/cn.js';

	/** The paper card most of the story's pictures sit on. */
	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<div
	class={cn(
		'border-site-line bg-site-card flex w-full flex-col rounded-[18px] border p-5.5 shadow-[0_30px_60px_-32px_rgb(30_45_35/0.32)]',
		className
	)}
>
	{@render children()}
</div>
