<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import { demo } from '../demo.js';
	import StoryCard from './StoryCard.svelte';

	/** Bringing the old documents in. The formats are the ones the upload accepts. */
	const files = $derived([
		{
			name: demo.files.bylaws,
			kind: 'PDF',
			tone: 'bg-site-red-tint text-site-red',
			status: m.landing_story_import_mapped()
		},
		{
			name: demo.files.notes,
			kind: 'DOCX',
			tone: 'bg-site-blue-tint text-site-blue',
			status: m.landing_story_import_suggested()
		}
	]);
</script>

<StoryCard class="gap-3.5">
	<p class="text-lg font-semibold">{m.landing_story_import_title()}</p>
	<p
		class="border-site-line-strong text-site-muted rounded-xl border-[1.5px] border-dashed p-5 text-center text-sm"
	>
		{m.landing_story_import_drop()}
	</p>
	{#each files as file (file.name)}
		<div
			class="border-site-line flex items-center gap-3 rounded-[10px] border bg-white px-3.5 py-3"
		>
			<span
				class="{file.tone} flex h-10 w-8.5 items-end justify-center rounded-[5px] pb-1.25 text-[9px] font-bold"
				>{file.kind}</span
			>
			<div class="min-w-0 flex-1">
				<p class="truncate text-[15px]">{file.name}</p>
				<p class="text-site-green text-[13px]">✓ {file.status}</p>
			</div>
		</div>
	{/each}
	<div class="border-site-line flex items-center gap-3 rounded-[10px] border bg-white px-3.5 py-3">
		<span
			class="bg-site-amber-tint text-site-amber flex h-10 w-8.5 items-end justify-center rounded-[5px] pb-1.25 text-[9px] font-bold"
			>MD</span
		>
		<div class="flex min-w-0 flex-1 flex-col gap-1.5">
			<p class="truncate text-[15px]">{demo.files.houseRules}</p>
			<div class="bg-site-line-soft h-1.25 overflow-hidden rounded-sm">
				<div class="bg-site-green h-full w-[64%]"></div>
			</div>
		</div>
		<span class="text-site-muted text-[13px]">{m.landing_story_import_reading()}</span>
	</div>
</StoryCard>
