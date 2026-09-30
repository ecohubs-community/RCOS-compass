<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import StoryCard from './StoryCard.svelte';

	/**
	 * The readiness view members see inside their community. Illustrative
	 * numbers for a community that does not exist; the app shows this only to
	 * members — outward, a community is compliant or not, never a percentage.
	 */
	const layers = $derived([
		{ name: m.landing_layer_0(), value: 100 },
		{ name: m.landing_layer_1(), value: 74 },
		{ name: m.landing_layer_2(), value: 45 },
		{ name: m.landing_layer_3(), value: 28 },
		{ name: m.landing_layer_4(), value: 0 },
		{ name: m.landing_layer_5(), value: 33 },
		{ name: m.landing_layer_6(), value: 10 }
	]);
</script>

<StoryCard class="gap-2.75">
	<p class="flex flex-wrap items-baseline gap-3">
		<span class="font-display text-[52px] leading-none">45%</span>
		<span class="text-site-ink-2 text-sm">{m.landing_story_ready_of()}</span>
	</p>
	{#each layers as layer, i (i)}
		<div class="grid grid-cols-[130px_1fr_36px] items-center gap-2.5 text-[13.5px]">
			<span class={layer.value === 0 ? 'text-site-red' : undefined}>{i} · {layer.name}</span>
			<span
				class="{layer.value === 0
					? 'bg-site-red-tint'
					: 'bg-site-line-soft'} h-2 overflow-hidden rounded"
			>
				<span class="bg-site-green block h-full" style:width="{layer.value}%"></span>
			</span>
			<span class="text-right {layer.value === 0 ? 'text-site-red' : 'text-site-muted'}"
				>{layer.value}</span
			>
		</div>
	{/each}
	<p
		class="border-site-red-line bg-site-red-wash text-site-red-ink mt-1.5 rounded-[10px] border px-3.25 py-2.75 text-sm"
	>
		{m.landing_story_ready_gap()}
	</p>
</StoryCard>
