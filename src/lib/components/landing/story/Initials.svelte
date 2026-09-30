<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';

	/** A person's initials in a tinted circle. */
	let {
		tone,
		initials,
		class: className
	}: { tone: 'rose' | 'sky' | 'sand' | 'red'; initials: string; class?: string } = $props();

	const tones = {
		rose: 'bg-site-rose-tint text-site-rose-ink',
		sky: 'bg-site-sky-tint text-site-sky-ink',
		sand: 'bg-site-sand-tint text-site-sand-ink',
		red: 'bg-site-red-tint text-site-red-ink'
	};
</script>

<span
	class={cn(
		'flex size-8 flex-none items-center justify-center rounded-full text-[11px] font-semibold',
		tones[tone],
		className
	)}>{initials}</span
>
