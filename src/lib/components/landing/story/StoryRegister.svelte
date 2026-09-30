<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';
	import StoryCard from './StoryCard.svelte';

	/** The decision register, searched for the greenhouse. */
	const rows = $derived([
		{
			ref: demo.greenhouseDecision,
			title: m.landing_story_reg_1(),
			meta: m.landing_story_reg_1_meta(),
			date: m.landing_story_reg_1_date(),
			due: false
		},
		{
			ref: demo.exitDecision,
			title: m.landing_tour_definition_title(),
			meta: m.landing_story_reg_2_meta(),
			date: m.landing_story_reg_2_date(),
			due: false
		},
		{
			ref: demo.spendingDecision,
			title: m.landing_story_reg_3(),
			meta: m.landing_story_reg_3_meta(),
			date: m.landing_story_reg_3_date(),
			due: false
		},
		{
			ref: demo.quietHoursDecision,
			title: m.landing_story_quiet_hours(),
			meta: m.landing_story_reg_4_meta(),
			date: m.landing_story_reg_4_date(),
			due: true
		}
	]);
</script>

<StoryCard class="overflow-hidden p-0">
	<div class="border-site-line flex items-center gap-2.5 border-b px-5 py-4.5">
		<span class="flex-1 text-lg font-semibold">{m.nav_decisions()}</span>
		<span class="border-site-line text-site-muted rounded-lg border bg-white px-3 py-1.5 text-sm"
			>{m.landing_story_reg_search()}</span
		>
	</div>
	{#each rows as row, i (row.ref)}
		<div
			class={cn(
				'border-site-line-soft grid grid-cols-[110px_1fr_64px] items-center gap-3 border-b px-5 py-3.5 text-sm last:border-b-0',
				i === 0 && 'bg-site-green-wash'
			)}
		>
			<span class={cn('font-code text-xs', i === 0 ? 'text-site-green' : 'text-site-muted')}
				>{row.ref}</span
			>
			<span
				>{row.title}
				<span class={cn('block text-xs', row.due ? 'text-site-amber' : 'text-site-muted')}
					>{row.meta}</span
				></span
			>
			<span class="text-site-ink-2 text-[13px]">{row.date}</span>
		</div>
	{/each}
</StoryCard>
