<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';
	import { reveal } from '../reveal.js';
	import TourChip from './TourChip.svelte';

	/**
	 * Stage 4: the adopted definition beside the clauses it answers. The clause
	 * text is RCOS-Core 0.1 §3.6, word for word (CC BY 4.0).
	 */
	let { level }: { level: number } = $props();

	const clauses = $derived([
		{ ref: '3.6.1', text: m.landing_clause_361() },
		{ ref: '3.6.2', text: m.landing_clause_362() },
		{ ref: '3.6.5', text: m.landing_clause_365() }
	]);
</script>

<div>
	<div class="text-fg-secondary flex flex-wrap items-center gap-2.25 text-xs">
		<TourChip tone="accent">{m.landing_tour_adopted_chip()}</TourChip>
		{m.landing_tour_layer_1_long()}
		<span class="font-code text-fg-muted text-[11px]"
			>{m.landing_tour_from_decision({ ref: demo.exitDecision })}</span
		>
	</div>
	<p class="mt-2.25 text-xl font-semibold tracking-[-.01em]">{m.landing_tour_definition_title()}</p>
</div>
<div class="flex flex-col gap-4.5 @2xl:flex-row">
	<div
		class="border-border bg-surface flex flex-col gap-3 rounded-[10px] border p-4 @2xl:w-82.5 @2xl:flex-none"
	>
		<p class="text-fg-muted text-[11px] tracking-[.06em] uppercase">{m.landing_tour_rcos_asks()}</p>
		<ul class="flex flex-col gap-2.75">
			{#each clauses as clause, i (clause.ref)}
				<li class="flex gap-2.5">
					<span
						class="border-border-strong relative mt-0.5 flex size-4.5 flex-none items-center justify-center rounded-full border"
					>
						<span
							class={cn(
								'bg-accent-fg text-bg absolute -inset-px flex items-center justify-center rounded-full text-[11px] transition-opacity duration-300',
								level >= i ? 'opacity-100' : 'opacity-0'
							)}>✓</span
						>
					</span>
					<span class="font-display text-fg text-[14px] leading-[1.45]">
						<span class="font-code text-fg-muted text-[11px]">{clause.ref}</span>
						{clause.text}
					</span>
				</li>
			{/each}
		</ul>
	</div>
	<div class="flex flex-1 flex-col gap-3.5">
		<p class="text-fg-muted text-[11px] tracking-[.06em] uppercase">{m.landing_tour_our_rule()}</p>
		<p class="flex gap-2.5 text-[14.5px] leading-[1.55]">
			<span class="font-code text-fg-muted pt-0.75 text-[11px]">A</span>{m.landing_rule_a()}
		</p>
		<p class="flex gap-2.5 text-[14.5px] leading-[1.55]">
			<span class="font-code text-fg-muted pt-0.75 text-[11px]">B</span>{m.landing_rule_b()}
		</p>
		<div
			class={cn(
				'border-accent/30 bg-accent/8 rounded-[10px] border px-4 py-3.5',
				reveal(level >= 3)
			)}
		>
			<p class="text-accent-fg mb-1.5 text-[11px] tracking-[.06em] uppercase">
				{m.landing_tour_how_we_got_here()}
			</p>
			<p class="text-forest-pale text-sm leading-[1.55]">{m.landing_tour_provenance()}</p>
		</div>
	</div>
</div>
