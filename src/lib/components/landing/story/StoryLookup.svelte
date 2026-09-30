<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';
	import StoryCard from './StoryCard.svelte';

	/**
	 * The reverse lookup: a plain question in, the rules that govern it out,
	 * with their references. It points at the rule and never answers for the
	 * community (`openspec/specs/search`), so the picture does not either.
	 */
	const hits = $derived([
		{ title: m.landing_story_lookup_hit_1(), ref: demo.meetingDecision, open: false },
		{ title: m.landing_story_lookup_hit_2(), ref: m.landing_story_lookup_hit_2_ref(), open: false },
		{ title: m.landing_story_lookup_hit_3(), ref: m.landing_state_open(), open: true }
	]);
</script>

<div class="flex w-full flex-col gap-3.5">
	<p
		class="bg-site-ink text-forest-fg max-w-95 self-end rounded-[18px_18px_4px_18px] px-4.5 py-3.5 text-[17px] leading-[1.4]"
	>
		{m.landing_story_lookup_question()}
	</p>
	<StoryCard class="gap-3 px-5.5 py-5">
		<p class="text-site-muted text-[13px]">{m.landing_story_lookup_found()}</p>
		{#each hits as hit (hit.title)}
			<div
				class="border-site-line flex items-center gap-3 rounded-[10px] border bg-white px-3.5 py-2.75"
			>
				<span class="flex-1 text-[15px]">{hit.title}</span>
				<span
					class={hit.open
						? 'bg-site-amber-tint text-site-amber rounded-md px-2 py-0.75 text-xs'
						: 'font-code bg-site-green-tint text-site-green-deep rounded-md px-2 py-0.75 text-xs'}
					>{hit.ref}</span
				>
			</div>
		{/each}
		<p
			class="bg-site-amber-tint text-site-amber-ink flex items-center gap-2.5 rounded-[10px] px-3.25 py-2.75 text-sm"
		>
			<span class="flex-1">{m.landing_story_lookup_gap()}</span>
			<span class="font-semibold whitespace-nowrap">{m.landing_story_lookup_start()}</span>
		</p>
	</StoryCard>
</div>
