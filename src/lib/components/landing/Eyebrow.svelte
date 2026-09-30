<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/components/ui/cn.js';

	/** The small monospaced label above a section heading. */
	let {
		tone = 'light',
		class: className,
		children
	}: { tone?: 'light' | 'dark'; class?: string; children: Snippet } = $props();
</script>

<p
	class={cn(
		'font-code text-[13px] tracking-[.06em] uppercase',
		tone === 'light' ? 'text-site-green' : 'text-mint',
		className
	)}
>
	{@render children()}
</p>
