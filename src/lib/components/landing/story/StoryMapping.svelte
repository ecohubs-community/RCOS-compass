<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import StoryCard from './StoryCard.svelte';

	/**
	 * Passages matched to the clause they answer. The states are the app's own:
	 * a match is suggested (by a person or the optional AI) and a member
	 * confirms it; a clause nothing answers is simply open.
	 */
	const rows = $derived([
		{
			from: m.landing_story_map_from_1(),
			to: m.landing_story_map_to_1(),
			state: 'suggested' as const
		},
		{
			from: m.landing_story_map_from_2(),
			to: m.landing_story_map_to_2(),
			state: 'confirmed' as const
		},
		{
			from: m.landing_story_map_from_3(),
			to: m.landing_story_map_to_3(),
			state: 'confirmed' as const
		},
		{ from: null, to: m.landing_story_map_to_4(), state: 'open' as const }
	]);

	const chip = {
		suggested: 'bg-site-amber-tint text-site-amber',
		confirmed: 'bg-site-green-tint text-site-green-deep',
		open: 'bg-site-red-tint text-site-red'
	};
	const label = $derived({
		suggested: m.landing_state_suggested(),
		confirmed: m.landing_state_confirmed(),
		open: m.landing_state_open()
	});
</script>

<StoryCard class="gap-2.5">
	<p class="flex items-baseline justify-between">
		<span class="text-lg font-semibold">{m.landing_story_map_title()}</span>
		<span class="font-code text-site-muted text-xs">v0.1</span>
	</p>
	{#each rows as row (row.to)}
		<div
			class="border-site-line-soft grid grid-cols-[1fr_20px_1fr_auto] items-center gap-2.5 border-b py-2.75 text-sm"
		>
			{#if row.from}
				<span class="text-site-ink-2">{row.from}</span>
			{:else}
				<span class="text-site-muted italic">{m.landing_story_map_nothing()}</span>
			{/if}
			<span class="text-site-muted" aria-hidden="true">→</span>
			<span>{row.to}</span>
			<span class="{chip[row.state]} rounded-full px-2.25 py-0.5 text-xs">{label[row.state]}</span>
		</div>
	{/each}
	<div class="mt-2.5 flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]">
		<span class="bg-site-green flex-31"></span>
		<span class="bg-site-amber-bar flex-9"></span>
		<span class="bg-site-red-bar flex-6"></span>
	</div>
	<p class="text-site-ink-2 flex gap-4.5 text-[13px]">
		<span>{m.landing_story_map_count_confirmed()}</span>
		<span>{m.landing_story_map_count_suggested()}</span>
		<span>{m.landing_story_map_count_open()}</span>
	</p>
</StoryCard>
