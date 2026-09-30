<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/components/ui/cn.js';

	/** A section's `h2`, in the display serif. The id is what the section is labelled by. */
	let {
		id,
		class: className,
		children
	}: { id: string; class?: string; children: Snippet } = $props();
</script>

<h2
	{id}
	class={cn(
		'font-display text-[clamp(36px,4.4vw,58px)] leading-[1.06] font-normal tracking-[-.02em] text-balance',
		className
	)}
>
	{@render children()}
</h2>
