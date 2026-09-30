<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';

	/**
	 * One beat of the story. The one being read is ink; the rest step back to
	 * the muted grey — still 4.7:1, where the design's fade to 28% opacity left
	 * readable text at 1.6:1.
	 */
	let {
		chapter,
		title,
		text,
		active
	}: { chapter: string; title: string; text: string; active: boolean } = $props();
</script>

<div data-story-step class="flex min-h-[62vh] flex-col justify-center gap-3 lg:min-h-[80vh]">
	<p class="font-code text-site-muted text-xs tracking-[.06em] uppercase">{chapter}</p>
	<h3
		class={cn(
			'font-display text-[36px] leading-[1.12] font-normal tracking-[-.015em] transition-colors duration-400',
			active ? 'text-site-ink' : 'text-site-muted'
		)}
	>
		{title}
	</h3>
	<p
		class={cn(
			'max-w-115 text-lg leading-[1.6] text-pretty transition-colors duration-400',
			active ? 'text-site-ink-2' : 'text-site-muted'
		)}
	>
		{text}
	</p>
</div>
