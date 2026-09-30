<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import PillLink from './PillLink.svelte';

	/** The page's one `h1`, and the two things to do next. */
	let { requestHref }: { requestHref: string | null } = $props();
</script>

<section
	id="top"
	aria-labelledby="hero-title"
	class="mx-auto flex max-w-[1240px] flex-col items-center px-4 pt-16 text-center sm:px-7 sm:pt-22"
>
	<p
		class="border-site-green-line bg-site-green-tint text-site-green-deep inline-flex items-center gap-2.5 rounded-full border py-1.5 pr-3.5 pl-3 text-sm"
	>
		<span class="bg-site-green size-1.75 shrink-0 rounded-full" aria-hidden="true"></span>
		{m.landing_hero_badge()}
	</p>
	<h1
		id="hero-title"
		class="font-display mt-7 max-w-[980px] text-[clamp(44px,6.4vw,84px)] leading-[1.02] font-normal tracking-[-.025em] text-balance"
	>
		{m.landing_hero_title_before()}<em class="text-site-green italic"
			>{m.landing_hero_title_em()}</em
		>{m.landing_hero_title_after()}
	</h1>
	<p
		class="text-site-ink-2 mt-6.5 max-w-[660px] text-[clamp(18px,1.6vw,21px)] leading-[1.55] text-pretty"
	>
		{m.landing_hero_lede()}
	</p>
	<div class="mt-9 flex flex-wrap justify-center gap-3">
		{#if requestHref}
			<PillLink href={requestHref} size="lg">{m.landing_request_access()}</PillLink>
		{/if}
		<PillLink href="#how" size="lg" variant="secondary">{m.landing_hero_tour()}</PillLink>
	</div>
	<p class="text-site-muted mt-5 text-sm">{m.landing_hero_audience()}</p>
</section>
