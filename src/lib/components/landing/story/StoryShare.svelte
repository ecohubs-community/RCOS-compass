<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';

	/** A protocol as a document, and the ways it leaves the app. */
</script>

<div class="flex w-full items-center gap-4.5">
	<div
		class="border-site-line flex h-82.5 w-62.5 flex-none -rotate-[2.5deg] flex-col gap-2.25 rounded-md border bg-white px-5.5 py-6 shadow-[0_30px_60px_-28px_rgb(30_45_35/0.4)]"
	>
		<p class="font-code text-site-muted text-[8.5px] tracking-[.05em] uppercase">
			{demo.community} · {m.landing_tour_layer_1_long()}
		</p>
		<p class="font-display text-[21px] leading-[1.1]">{m.landing_artifact_title()}</p>
		<p class="text-site-muted text-[10px]">{m.landing_artifact_meta_short()}</p>
		<div class="bg-site-line my-1 h-px"></div>
		<p class="text-[10.5px] font-semibold">{m.landing_artifact_s1_title()}</p>
		<p class="font-display text-site-ink-2 text-[11px] leading-[1.45]">{m.landing_artifact_s1()}</p>
		<p class="text-[10.5px] font-semibold">{m.landing_artifact_s2_title()}</p>
		<p class="font-display text-site-ink-2 text-[11px] leading-[1.45]">{m.landing_artifact_s2()}</p>
	</div>
	<div class="flex flex-1 flex-col gap-2.5">
		<p
			class="bg-site-green flex items-center justify-between rounded-xl px-4 py-3.25 text-[15px] font-semibold text-white"
		>
			{m.landing_export_pdf_download()}<span class="text-[13px] font-normal"
				>{m.landing_export_pdf_note()}</span
			>
		</p>
		<p
			class="border-site-line bg-site-card flex items-center justify-between gap-2 rounded-xl border px-4 py-3.25 text-[15px]"
		>
			<span class="whitespace-nowrap">{m.landing_export_markdown()}</span><span
				class="text-site-muted text-right text-[13px]">{m.landing_export_markdown_note()}</span
			>
		</p>
		<p class="text-site-muted mt-1.5 text-[13px]">{m.landing_export_public()}</p>
		<p
			class="font-code border-site-line text-site-ink-2 truncate rounded-[10px] border bg-white px-3.25 py-2.75 text-xs"
		>
			{demo.publicPage}
		</p>
		<p class="text-site-muted text-[13px]">{m.landing_story_share_decision()}</p>
	</div>
</div>
