<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import StoryCard from './StoryCard.svelte';

	/** A term explained where it is read, and a note back to the standard. */
	const term = 'border-site-green border-b-[1.5px] border-dotted';
</script>

<div class="flex w-full flex-col gap-4">
	<StoryCard class="relative p-6">
		<p class="font-display text-[22px] leading-[1.55]">
			{m.landing_story_gloss_a()}
			<span class={term}>{m.landing_story_gloss_strategic()}</span>
			{m.landing_story_gloss_b()}
			<span class="border-site-green bg-site-green-tint border-b-[1.5px] px-0.5"
				>{m.landing_consent_lower()}</span
			>
			{m.landing_story_gloss_c()}
			<span class={term}>{m.landing_story_gloss_provisional()}</span>{m.landing_story_gloss_d()}
		</p>
		<div
			class="bg-site-ink text-forest-fg mt-4 ml-22.5 rounded-[14px] px-4.5 py-4 shadow-[0_24px_50px_-20px_rgb(20_30_25/0.5)]"
		>
			<p class="text-base font-semibold">{m.landing_consent()}</p>
			<p class="text-forest-muted mt-1.25 text-[14.5px] leading-normal">
				{m.landing_story_gloss_definition()}
			</p>
			<p class="text-mint mt-2.5 text-[13px]">{m.landing_story_gloss_open()}</p>
		</div>
	</StoryCard>
	<p
		class="border-site-line bg-site-card flex items-center gap-3 rounded-[14px] border px-4 py-3.25 text-sm"
	>
		<span class="font-code text-site-muted text-xs">{m.landing_story_gloss_source()}</span>
		<span class="flex-1"></span>
		<span class="text-site-green font-semibold">{m.landing_story_gloss_note()}</span>
	</p>
</div>
