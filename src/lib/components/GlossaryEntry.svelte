<script lang="ts">
	import { links } from '$lib/links';

	/**
	 * One term, shared by the page and the panel.
	 *
	 * Two definitions side by side need to say which is which every time, or a
	 * reader takes the standard's words for their community's — the mistake this
	 * screen exists to prevent.
	 */
	type Entry = {
		key: string;
		term: string;
		definition: string;
		isFallback: boolean;
		sectionKey: string | null;
		sectionTitle: string | null;
		ours: { definitionId: string; body: string; adoptedAt: number } | null;
	};

	let {
		entry,
		slug,
		heading = 'h3'
	}: { entry: Entry; slug: string; heading?: 'h2' | 'h3' } = $props();
</script>

<article class="border-border bg-surface rounded-(--radius-card) border p-4">
	<svelte:element this={heading} id={entry.key} class="text-fg font-medium">
		{entry.term}
	</svelte:element>

	<p class="text-fg-muted text-meta mt-0.5">
		The standard{#if entry.isFallback}, in English — no translation for your language yet{/if}
	</p>
	<p class="text-fg-secondary mt-1">{entry.definition}</p>

	<div class="border-border/60 mt-3 border-t pt-3">
		{#if entry.ours}
			<p class="text-fg-muted text-meta">
				This community{#if entry.sectionTitle}
					· {entry.sectionTitle}{/if}
			</p>
			<p class="text-fg-secondary mt-1">{entry.ours.body}</p>
			<p class="mt-2">
				<a
					href={links.definition(slug, entry.ours.definitionId)}
					class="text-fg text-meta underline underline-offset-2">Where this was decided</a
				>
			</p>
		{:else if entry.sectionKey}
			<!--
				"Not defined yet" and "not something a community defines" are different
				facts, and collapsing them would tell a community it is behind on
				twenty-two words that were never theirs to write.
			-->
			<p class="text-fg-muted text-meta">
				This community has not defined this yet{#if entry.sectionTitle}
					— it belongs in “{entry.sectionTitle}”{/if}.
			</p>
		{:else}
			<p class="text-fg-muted text-meta">
				A word for talking about the standard, not something a community defines.
			</p>
		{/if}
	</div>
</article>
