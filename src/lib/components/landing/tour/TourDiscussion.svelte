<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';
	import { reveal } from '../reveal.js';
	import TourChip from './TourChip.svelte';

	/**
	 * Stage 2: a discussion and a proposal. The linter's finding is the app's own
	 * wording for a vague phrase (`src/lib/server/linter/index.ts`), and the fix
	 * is Marco's — the linter names the problem, it does not write the rule.
	 */
	let { level }: { level: number } = $props();

	const fixed = $derived(level >= 3);
</script>

<div>
	<div class="text-fg-secondary flex flex-wrap items-center gap-2.25 text-xs">
		<TourChip tone="attention">{m.landing_status_in_discussion()}</TourChip>
		{m.landing_tour_layer_1_long()}
		<span class="font-code text-fg-muted text-[11px]">{m.landing_tour_clause_exit()}</span>
	</div>
	<p class="mt-2.25 text-xl font-semibold tracking-[-.01em]">{m.landing_q_leave()}</p>
</div>
<div class="flex min-h-0 flex-1 flex-col gap-4.5 @2xl:flex-row">
	<div class="flex flex-1 flex-col gap-3.5">
		<div class={cn('flex gap-2.75', reveal(level >= 0))}>
			<span
				class="bg-site-rose-ink/45 text-site-rose-tint flex size-7 flex-none items-center justify-center rounded-full text-[10px] font-semibold"
				>{demo.people.lena}</span
			>
			<div>
				<p class="text-fg-secondary text-xs">{m.landing_tour_lena_meta()}</p>
				<p class="text-fg mt-0.75 text-sm leading-normal">{m.landing_tour_lena_says()}</p>
			</div>
		</div>
		<div class={cn('flex gap-2.75', reveal(level >= 1))}>
			<span
				class="bg-site-sky-ink/50 text-site-sky-tint flex size-7 flex-none items-center justify-center rounded-full text-[10px] font-semibold"
				>{demo.people.marco}</span
			>
			<div>
				<p class="text-fg-secondary text-xs">{m.landing_tour_marco_meta()}</p>
				<p class="text-fg mt-0.75 text-sm leading-normal">{m.landing_tour_marco_says()}</p>
			</div>
		</div>
	</div>
	<div
		class={cn(
			'border-border bg-surface flex flex-none flex-col gap-3 rounded-[10px] border p-4 @2xl:w-97.5',
			reveal(level >= 2)
		)}
	>
		<p class="text-info-fg text-[11px] tracking-[.06em] uppercase">
			{m.landing_tour_proposal_label()}
		</p>
		<p class="font-display text-fg text-[17px] leading-normal">
			{m.landing_proposal_before()}
			{#if fixed}
				<span class="bg-accent-fg/20 rounded-xs px-0.5">{m.landing_proposal_fixed()}</span>
			{:else}
				<span class="bg-attention/20 border-attention border-b-[1.5px] border-dashed px-0.5"
					>{m.landing_proposal_vague()}</span
				>
			{/if}
			{m.landing_proposal_after()}
		</p>
		{#if fixed}
			<p class="border-border text-fg-secondary border-t pt-2.75 text-xs">
				<span class="text-accent-fg">✓</span>
				{m.landing_tour_lint_clean()}
			</p>
		{:else}
			<p
				class={cn(
					'border-attention/30 bg-attention/8 text-attention-fg rounded-lg border px-3 py-2.75 text-[12.5px] leading-normal transition-shadow duration-300',
					level === 2 && 'ring-attention/35 ring-3'
				)}
			>
				{m.landing_lint_vague({ word: m.landing_proposal_vague() })}
			</p>
		{/if}
	</div>
</div>
