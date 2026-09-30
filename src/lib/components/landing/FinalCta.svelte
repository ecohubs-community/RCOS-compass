<script lang="ts">
	import Logo from '$lib/components/Logo.svelte';
	import * as m from '$lib/paraglide/messages';
	import { RCOS_STANDARD_URL } from './demo.js';
	import PillLink from './PillLink.svelte';

	let { requestHref }: { requestHref: string | null } = $props();
</script>

<section
	id="start"
	aria-labelledby="start-title"
	class="mx-auto flex max-w-[1240px] flex-col items-center px-4 pt-32 pb-24 text-center sm:px-7 sm:pt-42.5 sm:pb-30"
>
	<Logo class="size-14" />
	<h2
		id="start-title"
		class="font-display mt-7.5 max-w-215 text-[clamp(38px,5vw,68px)] leading-[1.05] font-normal tracking-[-.02em] text-balance"
	>
		{m.landing_cta_title()}
	</h2>
	<p class="text-site-ink-2 mt-5.5 max-w-135 text-[19px]">{m.landing_cta_lede()}</p>
	<div class="mt-8.5 flex flex-wrap justify-center gap-3">
		{#if requestHref}
			<PillLink href={requestHref} size="lg">{m.landing_request_access()}</PillLink>
		{/if}
		<PillLink href={RCOS_STANDARD_URL} size="lg" variant="secondary"
			>{m.landing_cta_standard()}</PillLink
		>
	</div>
</section>
