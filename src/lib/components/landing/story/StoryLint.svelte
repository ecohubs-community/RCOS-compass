<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import StoryCard from './StoryCard.svelte';

	/** The linter's finding on Marco's draft, in the app's own words. */
</script>

<div class="relative w-full">
	<StoryCard class="gap-3.5 p-6">
		<p class="text-site-blue text-xs tracking-[.06em] uppercase">{m.landing_story_lint_label()}</p>
		<p class="font-display text-[23px] leading-[1.45]">
			{m.landing_proposal_before()}
			<span class="border-site-amber-bar bg-site-amber-tint border-b-2 border-dashed px-0.75"
				>{m.landing_proposal_vague()}</span
			>
			{m.landing_proposal_after()}
		</p>
	</StoryCard>
	<div
		class="bg-site-ink text-forest-fg relative -mt-1.5 mr-6.5 ml-22.5 flex flex-col gap-3 rounded-[14px] px-4.5 py-4 shadow-[0_24px_50px_-20px_rgb(20_30_25/0.5)]"
	>
		<p class="text-[15px] leading-normal">
			{m.landing_lint_vague({ word: m.landing_proposal_vague() })}
		</p>
		<p class="text-forest-muted text-sm leading-normal">{m.landing_story_lint_why()}</p>
	</div>
</div>
