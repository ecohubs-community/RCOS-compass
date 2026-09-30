<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';
	import { reveal } from '../reveal.js';
	import TourChip from './TourChip.svelte';

	/** Stage 3: the consent round closes and a steward freezes the version. */
	let { level }: { level: number } = $props();

	const tally = $derived([
		{ label: m.landing_consent(), count: 14, width: level >= 1 ? 74 : 0, bar: 'bg-accent-fg' },
		{ label: m.landing_abstain(), count: 3, width: level >= 1 ? 16 : 0, bar: 'bg-attention' },
		{ label: m.landing_object(), count: 0, width: 0, bar: 'bg-danger' }
	]);
</script>

<div>
	<div class="text-fg-secondary flex flex-wrap items-center gap-2.25 text-xs">
		<TourChip tone="info">{m.landing_tour_round_chip()}</TourChip>
		{m.landing_tour_round_closes()}
	</div>
	<p class="mt-2.25 text-xl font-semibold tracking-[-.01em]">{m.landing_q_leave()}</p>
</div>
<div class="border-border bg-surface overflow-hidden rounded-[10px] border">
	<div class="border-border flex flex-wrap items-baseline gap-2.5 border-b px-4 py-3">
		<span class="font-semibold">{m.landing_tour_responses()}</span>
		<span class="text-fg-muted text-xs">{m.landing_consent_meaning()}</span>
		<span class="flex-1"></span>
		<span class="text-fg-secondary text-xs">{m.landing_tour_responded()}</span>
	</div>
	<div class="flex flex-col gap-3 p-4">
		{#each tally as row, i (row.label)}
			<div class="flex items-center gap-3">
				<span class="text-fg-secondary w-20 text-[12.5px]">{row.label}</span>
				<span class="bg-border h-2 flex-1 overflow-hidden rounded">
					<span
						class={cn('block h-full transition-[width] duration-1000 ease-out', row.bar)}
						style:width="{row.width}%"
						style:transition-delay="{i * 150}ms"
					></span>
				</span>
				<span class="w-6 text-right tabular-nums">{row.count}</span>
			</div>
		{/each}
	</div>
</div>
<div
	class={cn(
		'border-accent/30 bg-accent/8 flex flex-wrap items-center gap-3.5 rounded-[10px] border px-4 py-3.25',
		reveal(level >= 2)
	)}
>
	<span class="text-forest-pale flex-1 text-[13.5px]">{m.landing_tour_ready_to_freeze()}</span>
	<span
		class={cn(
			'bg-accent-solid rounded-md px-3.5 py-2 text-white transition-shadow duration-300',
			level >= 2 && 'ring-accent-fg/30 ring-4'
		)}>{m.landing_tour_freeze_v3()}</span
	>
</div>
<div
	class={cn(
		'bg-bg/60 pointer-events-none absolute inset-0 flex items-center justify-center p-4 transition-opacity duration-500',
		level >= 3 ? 'opacity-100' : 'opacity-0'
	)}
>
	<div
		class={cn(
			'bg-surface border-border-strong flex w-full max-w-100 flex-col gap-3.5 rounded-xl border p-5.5 transition-transform duration-500 ease-[cubic-bezier(.3,1.4,.5,1)]',
			level >= 3 ? 'scale-100' : 'scale-94'
		)}
	>
		<div class="flex items-center gap-2.5">
			<span
				class="bg-accent-fg/15 text-accent-fg flex size-7.5 items-center justify-center rounded-full text-[15px]"
				>✓</span
			>
			<div>
				<p class="text-[15px] font-semibold">{m.landing_tour_recorded()}</p>
				<p class="font-code text-fg-muted mt-0.5 text-[11.5px]">{demo.exitDecision}</p>
			</div>
		</div>
		<dl class="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
			<div>
				<dt class="text-fg-muted text-[11.5px]">{m.landing_decision_type()}</dt>
				<dd>{m.landing_decision_strategic()}</dd>
			</div>
			<div>
				<dt class="text-fg-muted text-[11.5px]">{m.landing_decision_mechanism()}</dt>
				<dd>{m.landing_consent()}</dd>
			</div>
			<div>
				<dt class="text-fg-muted text-[11.5px]">{m.landing_decision_present()}</dt>
				<dd>{m.landing_tour_present_value()}</dd>
			</div>
			<div>
				<dt class="text-fg-muted text-[11.5px]">{m.landing_decision_review()}</dt>
				<dd>{m.landing_review_date()}</dd>
			</div>
		</dl>
	</div>
</div>
