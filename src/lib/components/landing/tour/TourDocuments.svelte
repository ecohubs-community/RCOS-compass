<script lang="ts">
	import { cn } from '$lib/components/ui/cn.js';
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';
	import { reveal } from '../reveal.js';

	/**
	 * Stage 5: definitions assembled into one of the standard's documents, and
	 * the ways out of the app that really exist — the PDF, the Markdown + JSON
	 * export, and a published read-only page.
	 */
	let { level }: { level: number } = $props();

	const exports = $derived([
		{ label: m.landing_export_pdf(), note: m.landing_export_pdf_note() },
		{ label: m.landing_export_markdown(), note: m.landing_export_markdown_note() },
		{ label: m.landing_export_public(), note: m.landing_export_public_note() }
	]);
</script>

<div class="flex flex-col gap-5.5 @3xl:flex-row">
	<article
		class="bg-site-card text-site-ink flex min-w-0 flex-1 flex-col gap-3 overflow-hidden rounded-lg px-6 py-6 @2xl:px-8.5 @2xl:py-7.5"
	>
		<p class="font-code text-site-muted text-[10.5px] tracking-[.04em] uppercase">
			{demo.community} · {m.landing_tour_layer_1_long()}
		</p>
		<p class="font-display text-[28px] leading-[1.1]">{m.landing_artifact_title()}</p>
		<p class="text-site-muted text-xs">{m.landing_artifact_meta()}</p>
		<div class="bg-site-line my-1.5 h-px"></div>
		<p class="text-[13px] font-semibold">{m.landing_artifact_s1_title()}</p>
		<p class="font-display text-site-ink-2 text-sm leading-normal">{m.landing_artifact_s1()}</p>
		<p class="text-[13px] font-semibold">{m.landing_artifact_s2_title()}</p>
		<p class="font-display text-site-ink-2 text-sm leading-normal">{m.landing_artifact_s2()}</p>
		<p class="text-[13px] font-semibold">{m.landing_artifact_s3_title()}</p>
		<p class="font-display text-site-ink-2 text-sm leading-normal">{m.landing_artifact_s3()}</p>
	</article>
	<div class="flex flex-col gap-3 @3xl:w-70 @3xl:flex-none">
		<div class="border-border bg-surface flex flex-col gap-2 rounded-[10px] border p-3.5">
			<p class="text-fg-secondary text-xs">{m.landing_tour_sections()}</p>
			<p class="text-[22px] font-semibold">
				{m.landing_tour_sections_value()}
				<span class="text-accent-fg text-xs font-normal">{m.landing_tour_complete()}</span>
			</p>
			<div class="bg-accent-fg h-1 rounded-sm"></div>
		</div>
		<div
			class={cn(
				'border-border bg-surface flex flex-col gap-2 rounded-[10px] border p-3.5',
				reveal(level >= 2)
			)}
		>
			<p class="text-fg-secondary mb-0.5 text-xs">{m.landing_tour_download_share()}</p>
			{#each exports as item, i (item.label)}
				<p
					class={cn(
						'flex items-center justify-between gap-3 rounded-md border px-2.75 py-2 transition-shadow duration-300',
						i === 0 ? 'border-accent/40 bg-accent-subtle text-mint' : 'border-border',
						i === 0 && level >= 3 && 'ring-accent-fg/30 ring-4'
					)}
				>
					<span class="whitespace-nowrap">{item.label}</span><span
						class="text-fg-muted text-right text-[11px]">{item.note}</span
					>
				</p>
			{/each}
		</div>
		<p
			class={cn(
				'bg-forest-raised text-forest-pale flex items-center gap-2.25 rounded-[10px] px-3.25 py-2.75 text-[12.5px]',
				reveal(level >= 3)
			)}
		>
			<span class="text-mint">✓</span>{m.landing_tour_published()}
		</p>
	</div>
</div>
