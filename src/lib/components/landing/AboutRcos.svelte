<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { RCOS_STANDARD_URL } from './demo.js';
	import Eyebrow from './Eyebrow.svelte';
	import LaterTag from './LaterTag.svelte';

	/** What RCOS is, for somebody who has never heard of it. */
	const principles = $derived([
		{ title: m.landing_rcos_p1_title(), text: m.landing_rcos_p1() },
		{ title: m.landing_rcos_p2_title(), text: m.landing_rcos_p2() },
		{ title: m.landing_rcos_p3_title(), text: m.landing_rcos_p3() }
	]);

	const layers = $derived([
		{ name: m.landing_layer_0_long(), text: m.landing_layer_0_text() },
		{ name: m.landing_layer_1(), text: m.landing_layer_1_text() },
		{ name: m.landing_layer_2(), text: m.landing_layer_2_text() },
		{ name: m.landing_layer_3(), text: m.landing_layer_3_text() },
		{ name: m.landing_layer_4(), text: m.landing_layer_4_text() },
		{ name: m.landing_layer_5(), text: m.landing_layer_5_text() },
		{ name: m.landing_layer_6(), text: m.landing_layer_6_text() }
	]);
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	The one link is to the standard's own site, outside this app.
-->

<section
	id="rcos"
	aria-labelledby="rcos-title"
	class="mx-auto max-w-[1280px] scroll-mt-10 px-2 pt-28 sm:px-5 sm:pt-37.5"
>
	<div
		class="bg-forest text-forest-fg grid gap-[clamp(36px,5vw,72px)] rounded-[24px] p-[clamp(24px,5vw,72px)] sm:rounded-[32px] min-[920px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
	>
		<div class="flex flex-col gap-5.5">
			<Eyebrow tone="dark">{m.landing_rcos_eyebrow()}</Eyebrow>
			<h2
				id="rcos-title"
				class="font-display text-[clamp(34px,3.8vw,52px)] leading-[1.08] font-normal tracking-[-.02em] text-balance"
			>
				{m.landing_rcos_title()}
			</h2>
			<p class="text-forest-muted text-lg leading-[1.6] text-pretty">
				{m.landing_rcos_lede_before()}<em>{m.landing_rcos_lede_em()}</em
				>{m.landing_rcos_lede_after()}
			</p>
			<ul class="mt-2 flex flex-col gap-4">
				{#each principles as principle (principle.title)}
					<li class="flex gap-3.5">
						<span class="bg-mint mt-2.25 size-2 flex-none rotate-45" aria-hidden="true"></span>
						<div>
							<h3 class="text-[17px] font-semibold">{principle.title}</h3>
							<p class="text-forest-muted text-base leading-normal">{principle.text}</p>
						</div>
					</li>
				{/each}
			</ul>
			<p
				class="border-forest-fg/16 text-forest-pale mt-1.5 rounded-2xl border px-4.5 py-4 text-[15px] leading-[1.55]"
			>
				<LaterTag tone="dark" />
				{m.landing_rcos_modules()}
			</p>
			<p>
				<a
					href={RCOS_STANDARD_URL}
					class="text-mint hover:text-forest-fg inline-flex min-h-11 items-center text-base font-semibold underline underline-offset-4"
					>{m.landing_rcos_read()}</a
				>
			</p>
		</div>
		<ol class="flex flex-col justify-center">
			{#each layers as layer, i (i)}
				<li class="border-forest-fg/12 flex gap-4.5 border-b py-4.5 last:border-b-0">
					<span class="font-code text-mint w-5.5 text-sm">{i}</span>
					<div>
						<p class="text-lg">{layer.name}</p>
						<p class="text-forest-soft text-[15px]">{layer.text}</p>
					</div>
				</li>
			{/each}
		</ol>
	</div>
</section>
