<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';

	/** Stage 1: the Path. `level` counts the beats of this stage; -1 before it, 9 after. */
	let { level }: { level: number } = $props();

	const rows = $derived([
		{
			q: m.landing_q_leave(),
			layer: m.landing_tour_layer_1(),
			note: m.landing_tour_path_unblocks(),
			risky: false
		},
		{
			q: m.landing_q_who_decides(),
			layer: m.landing_tour_layer_2(),
			note: m.landing_tour_path_one_meeting(),
			risky: false
		},
		{
			q: m.landing_q_spend(),
			layer: m.landing_tour_layer_3(),
			note: m.landing_tour_path_half_written(),
			risky: false
		},
		{
			q: m.landing_q_conflict(),
			layer: m.landing_tour_layer_4(),
			note: m.landing_tour_path_riskiest(),
			risky: true
		}
	]);
</script>

<div>
	<p class="text-xl font-semibold tracking-[-.01em]">{m.landing_tour_path_title()}</p>
	<p class="text-fg-muted mt-1">{m.landing_tour_path_sub()}</p>
</div>
<div
	class="border-border bg-surface flex flex-wrap items-center gap-2 rounded-lg border px-3.5 py-2.75"
>
	<span class="mr-2 font-semibold">{m.landing_lens_label()}</span>
	<span
		class="border-accent/40 bg-accent-subtle text-accent-fg rounded-md border px-2.75 py-1.5 text-xs"
		>{m.landing_lens_unblock()}</span
	>
	<span class="border-border text-fg-secondary rounded-md border px-2.75 py-1.5 text-xs"
		>{m.landing_lens_risky()}</span
	>
	<span class="border-border text-fg-secondary rounded-md border px-2.75 py-1.5 text-xs"
		>{m.landing_lens_going()}</span
	>
</div>
<ol class="border-border bg-surface divide-border overflow-hidden rounded-lg border">
	{#each rows as row, i (i)}
		<li
			class={cn(
				'border-border flex flex-wrap items-center gap-3.5 border-b px-4 py-3.5 transition-colors duration-400 last:border-b-0',
				i === 0 && level >= 1 && 'bg-raised'
			)}
		>
			<span class="text-fg-muted w-4.5 text-xs">{i + 1}</span>
			<span class="flex min-w-48 flex-1 flex-col gap-1.5">
				<span class="text-[15px]">{row.q}</span>
				<span class="text-fg-muted flex flex-wrap gap-2.25 text-[11px]">
					<span class="border-border text-fg-secondary rounded border px-1.5">{row.layer}</span>
					<span class={row.risky ? 'text-danger' : undefined}>{row.note}</span>
				</span>
			</span>
			{#if i === 0}
				<span
					class={cn(
						'ml-8 rounded-md border px-3 py-1.75 text-xs transition-all duration-300 @xl:ml-0',
						level >= 2
							? 'bg-accent-solid border-accent-solid text-white ring-4 ring-accent-fg/30'
							: 'border-accent/40 bg-accent-subtle text-accent-fg ring-0'
					)}>{m.landing_tour_start_discussion()}</span
				>
			{/if}
		</li>
	{/each}
</ol>
