<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';
	import StoryCard from './StoryCard.svelte';

	/**
	 * A decision due for review, and how a rule changes: a later version frozen
	 * as a new decision that supersedes the old one, which stays on record.
	 */
</script>

<StoryCard class="gap-4.5 p-6">
	<div class="flex items-start gap-3">
		<div class="flex-1">
			<p class="font-code text-site-muted text-xs">{demo.quietHoursDecision}</p>
			<p class="mt-1 text-[19px] font-semibold">{m.landing_story_quiet_hours()}</p>
		</div>
		<span class="bg-site-amber-tint text-site-amber rounded-full px-2.75 py-1 text-[13px]"
			>{m.landing_story_revise_due()}</span
		>
	</div>
	<ol>
		<li class="flex gap-3.5">
			<span class="flex flex-col items-center">
				<span class="border-site-line-strong bg-site-card size-3 rounded-full border-2"></span>
				<span class="bg-site-line w-0.5 flex-1"></span>
			</span>
			<span class="pb-4">
				<span class="block text-sm font-semibold">{m.landing_story_revise_v1()}</span>
				<span class="text-site-muted block text-sm">{m.landing_story_revise_v1_note()}</span>
			</span>
		</li>
		<li class="flex gap-3.5">
			<span class="flex flex-col items-center">
				<span class="border-site-green bg-site-green size-3 rounded-full border-2"></span>
				<span class="bg-site-line w-0.5 flex-1"></span>
			</span>
			<span class="pb-4">
				<span class="block text-sm font-semibold">{m.landing_story_revise_v2()}</span>
				<span class="text-site-muted block text-sm">{m.landing_story_revise_v2_note()}</span>
			</span>
		</li>
		<li class="flex gap-3.5">
			<span class="border-site-green bg-site-card size-3 rounded-full border-2 border-dashed"
			></span>
			<span>
				<span class="text-site-green block text-sm font-semibold"
					>{m.landing_story_revise_v3()}</span
				>
				<span class="text-site-muted block text-sm">{m.landing_story_revise_v3_note()}</span>
			</span>
		</li>
	</ol>
	<p class="flex flex-wrap gap-2">
		<span class="bg-site-green rounded-lg px-3.75 py-2.25 text-sm font-semibold text-white"
			>{m.landing_story_revise_continue()}</span
		>
	</p>
</StoryCard>
