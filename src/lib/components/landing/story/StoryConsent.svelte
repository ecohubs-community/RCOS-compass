<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';
	import Initials from './Initials.svelte';
	import StoryCard from './StoryCard.svelte';

	/** A round with one reasoned objection, and the amendment it produced. */
	const tally = $derived([
		{ label: m.landing_consent(), count: 9, width: 47, bar: 'bg-site-green' },
		{ label: m.landing_abstain(), count: 2, width: 11, bar: 'bg-site-amber-bar' },
		{ label: m.landing_object(), count: 1, width: 5, bar: 'bg-site-red-bar' }
	]);
</script>

<div class="flex w-full flex-col gap-3.5">
	<StoryCard class="gap-3.25">
		<p class="flex items-baseline justify-between">
			<span class="text-lg font-semibold">{m.landing_story_consent_title()}</span>
			<span class="text-site-muted text-[13px]">{m.landing_story_consent_responded()}</span>
		</p>
		{#each tally as row (row.label)}
			<div class="flex items-center gap-3 text-sm">
				<span class="text-site-ink-2 w-17.5">{row.label}</span>
				<span class="bg-site-line-soft h-2.5 flex-1 overflow-hidden rounded-[5px]">
					<span class="{row.bar} block h-full" style:width="{row.width}%"></span>
				</span>
				<span class="w-5 text-right">{row.count}</span>
			</div>
		{/each}
	</StoryCard>
	<div
		class="border-site-red-line bg-site-red-wash ml-10 flex flex-col gap-2.25 rounded-2xl border px-4.5 py-4"
	>
		<p class="flex items-center gap-2.25 text-sm">
			<Initials tone="red" initials={demo.people.tomas} class="size-6.5 text-[10px]" />
			{m.landing_story_consent_objects()}
			<span class="flex-1"></span>
			<span class="text-site-red text-xs">{m.landing_story_consent_needs_reply()}</span>
		</p>
		<p class="text-site-red-ink text-[15px] leading-normal">
			{m.landing_story_consent_objection()}
		</p>
	</div>
	<p
		class="border-site-green-line bg-site-green-tint text-site-green-deep ml-20 rounded-xl border px-3.5 py-2.75 text-sm"
	>
		{m.landing_story_consent_amended()}
	</p>
</div>
