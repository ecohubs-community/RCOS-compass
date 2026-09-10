<script lang="ts">
	import GlossaryEntry from '$lib/components/GlossaryEntry.svelte';

	let { data } = $props();
	const slug = $derived(data.community.slug);

	const defined = $derived(data.terms.filter((term) => term.ours !== null).length);
	const definable = $derived(data.terms.filter((term) => term.sectionKey !== null).length);
</script>

<svelte:head><title>Glossary · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">Glossary</h1>
	<p class="text-fg-secondary mt-2">
		Every word the standard defines, with what this community has decided it means. Nothing here is
		maintained: it comes from your adopted definitions and changes when they do.
	</p>
	<p class="text-fg-muted text-meta mt-2" data-tabular>
		{defined} of {definable} defined by this community · {data.terms.length} terms in total
	</p>

	<div class="mt-6 flex flex-col gap-3">
		{#each data.terms as term (term.key)}
			<GlossaryEntry entry={term} {slug} heading="h2" />
		{/each}
	</div>
</main>
