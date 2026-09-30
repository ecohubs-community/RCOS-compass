<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';
	import StoryCard from './StoryCard.svelte';

	/** The Path with its lens chosen, and the member's private order. */
	const rows = $derived([
		{
			q: m.landing_q_leave_short(),
			note: m.landing_story_path_unblocks_3(),
			tone: 'text-site-green'
		},
		{
			q: m.landing_q_who_decides_short(),
			note: m.landing_story_path_unblocks_2(),
			tone: 'text-site-muted'
		},
		{ q: m.landing_q_conflict_short(), note: m.landing_story_path_risky(), tone: 'text-site-red' },
		{ q: m.landing_q_spend(), note: m.landing_tour_path_half_written(), tone: 'text-site-muted' }
	]);
</script>

<StoryCard class="gap-3.5">
	<p class="text-lg font-semibold">{m.landing_lens_label()}</p>
	<div class="flex flex-wrap gap-1.5 text-[13px]">
		<span
			class="border-site-green-line bg-site-green-tint text-site-green-deep rounded-full border px-3 py-1.5"
			>{m.landing_lens_unblock_short()}</span
		>
		<span class="border-site-line text-site-ink-2 rounded-full border px-3 py-1.5"
			>{m.landing_lens_risky_short()}</span
		>
		<span class="border-site-line text-site-ink-2 rounded-full border px-3 py-1.5"
			>{m.landing_lens_going_short()}</span
		>
	</div>
	<ol class="border-site-line flex flex-col overflow-hidden rounded-xl border bg-white">
		{#each rows as row, i (i)}
			<li
				class={cn(
					'border-site-line-soft flex items-center gap-3 border-b px-3.5 py-3.25 last:border-b-0',
					i === 0 && 'bg-site-green-wash'
				)}
			>
				<span
					class={cn(
						'flex size-6 items-center justify-center rounded-full text-xs',
						i === 0 ? 'bg-site-green text-white' : 'border-site-line-strong text-site-muted border'
					)}>{i + 1}</span
				>
				<span class="flex-1 text-[15px]">{row.q}</span>
				<span class="{row.tone} text-xs">{row.note}</span>
			</li>
		{/each}
	</ol>
	<p class="text-site-muted text-[13px]">{m.landing_story_path_private()}</p>
</StoryCard>
