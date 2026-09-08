<script lang="ts">
	import type { BlockNode } from '$lib/shared/markdown';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import * as m from '$lib/paraglide/messages';

	/**
	 * One component for three routes.
	 *
	 * The paths are `/privacy`, `/terms` and `/sub-processors` rather than
	 * `/legal/<id>`, because those are the addresses people paste to each other
	 * and expect to work — and three three-line routes sharing this is cheaper
	 * than three copies of a page.
	 */
	let {
		data
	}: {
		data: {
			title: string;
			blocks: BlockNode[];
			reviewed: { at: number; note: string | null } | null;
		};
	} = $props();

	const day = (ms: number) =>
		new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
</script>

<svelte:head><title>{data.title}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-10">
	<!--
		The notice is rendered from the review state rather than typed into the
		file, so it cannot be left behind by an edit — and an edit is exactly what
		makes it true again.
	-->
	{#if data.reviewed}
		<p class="text-fg-muted text-meta">
			{m.legal_reviewed({ date: day(data.reviewed.at) })}
		</p>
	{:else}
		<p role="note" class="text-attention text-meta">{m.legal_draft_notice()}</p>
	{/if}

	<article class="mt-6">
		<Markdown blocks={data.blocks} />
	</article>
</main>
