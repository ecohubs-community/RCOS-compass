<script lang="ts">
	import * as m from '$lib/paraglide/messages';

	/** "Who decided that?" — the questions scattered across chats and notebooks. */
	const bubble =
		'border-site-line bg-site-card absolute max-w-70 border px-4 py-3 shadow-[0_16px_30px_-18px_rgb(30_45_35/0.35)]';
</script>

<div class="relative h-full w-full">
	<div class="{bubble} top-6 left-2.5 -rotate-3 rounded-[16px_16px_16px_4px]">
		<p class="text-site-muted text-xs">{m.landing_story_q1_who()}</p>
		<p class="mt-0.5 text-base">{m.landing_story_q1()}</p>
	</div>
	<div class="{bubble} top-24 right-1.5 max-w-65 rotate-[2.5deg] rounded-[16px_16px_4px_16px]">
		<p class="text-site-muted text-xs">{m.landing_story_q2_who()}</p>
		<p class="mt-0.5 text-base">{m.landing_story_q2()}</p>
	</div>
	<div class="{bubble} top-79.5 left-10 max-w-65 rotate-[1.5deg] rounded-[16px_16px_16px_4px]">
		<p class="text-site-muted text-xs">{m.landing_story_q3_who()}</p>
		<p class="mt-0.5 text-base">{m.landing_story_q3()}</p>
	</div>
	<div class="{bubble} top-98 right-5 max-w-65 -rotate-2 rounded-[16px_16px_4px_16px]">
		<p class="text-site-muted text-xs">{m.landing_story_q4_who()}</p>
		<p class="mt-0.5 text-base">{m.landing_story_q4()}</p>
	</div>
	<div
		class="bg-site-ink text-forest-fg absolute top-49 right-17.5 left-17.5 flex flex-col gap-2.5 rounded-[14px] px-4.5 py-4 shadow-[0_30px_60px_-24px_rgb(20_30_25/0.55)]"
	>
		<p
			class="border-forest-fg/16 flex items-center gap-2.5 rounded-lg border px-3 py-2.25 text-[15px]"
		>
			<span class="border-forest-soft size-2.5 rounded-full border-[1.5px]"
			></span>{m.landing_story_q_search()}
		</p>
		<p class="text-forest-muted text-sm">{m.landing_story_q_nothing()}</p>
	</div>
</div>
