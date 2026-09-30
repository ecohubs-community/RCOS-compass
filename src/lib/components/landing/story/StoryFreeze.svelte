<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';
	import StoryCard from './StoryCard.svelte';

	/** What a freeze records — the fields the app asks for, no more. */
	const fields = $derived([
		{ label: m.landing_decision_type(), value: m.landing_decision_strategic() },
		{ label: m.landing_decision_mechanism(), value: m.landing_consent() },
		{ label: m.landing_decision_present(), value: m.landing_story_freeze_present() },
		{ label: m.landing_decision_review(), value: m.landing_review_date() }
	]);
</script>

<StoryCard class="relative gap-4 p-6">
	<div>
		<p class="text-lg font-semibold">{m.landing_story_freeze_title()}</p>
		<p class="text-site-muted mt-0.75 text-[13px]">{m.landing_story_freeze_sub()}</p>
	</div>
	<dl class="grid grid-cols-2 gap-3">
		{#each fields as field (field.label)}
			<div class="border-site-line rounded-[10px] border bg-white px-3 py-2.5">
				<dt class="text-site-muted text-xs">{field.label}</dt>
				<dd class="text-[15px]">{field.value}</dd>
			</div>
		{/each}
	</dl>
	<div class="border-site-line rounded-[10px] border bg-white px-3.5 py-3">
		<p class="text-site-muted text-xs">{m.landing_story_freeze_why_label()}</p>
		<p class="text-[15px] leading-normal">{m.landing_story_freeze_why()}</p>
	</div>
	<p
		class="border-site-green bg-site-bg font-code text-site-green absolute -right-2.5 -bottom-5.5 -rotate-6 rounded-[10px] border-2 px-3.5 py-2 text-sm font-medium tracking-[.04em]"
	>
		{demo.exitDecision} ✓
	</p>
</StoryCard>
