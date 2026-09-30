<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';
	import Initials from './Initials.svelte';
	import StoryCard from './StoryCard.svelte';

	/** A discussion that knows which clause it answers. */
	const messages = $derived([
		{
			who: m.landing_name_lena(),
			initials: demo.people.lena,
			tone: 'rose' as const,
			text: m.landing_story_conv_lena()
		},
		{
			who: m.landing_name_marco(),
			initials: demo.people.marco,
			tone: 'sky' as const,
			text: m.landing_story_conv_marco()
		},
		{
			who: m.landing_name_ana(),
			initials: demo.people.ana,
			tone: 'sand' as const,
			text: m.landing_story_conv_ana()
		}
	]);
</script>

<StoryCard class="gap-4">
	<div>
		<p class="text-site-muted flex items-center gap-2 text-xs">
			<span class="bg-site-amber-tint text-site-amber rounded-full px-2.25 py-0.5"
				>{m.landing_status_in_discussion()}</span
			>
			<span class="font-code">{m.landing_story_conv_clause()}</span>
		</p>
		<p class="mt-2 text-[19px] leading-[1.3] font-semibold">{m.landing_story_conv_title()}</p>
	</div>
	{#each messages as message (message.who)}
		<div class="flex gap-3">
			<Initials tone={message.tone} initials={message.initials} />
			<div>
				<p class="text-site-muted text-[13px]">{message.who}</p>
				<p class="text-[15px] leading-normal">{message.text}</p>
			</div>
		</div>
	{/each}
	<p class="border-site-line text-site-muted rounded-[10px] border bg-white px-3.5 py-2.75 text-sm">
		{m.landing_story_conv_reply()}
	</p>
</StoryCard>
