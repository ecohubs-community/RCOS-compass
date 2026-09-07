<script lang="ts">
	import Markdown from '$lib/components/ui/Markdown.svelte';

	let { data } = $props();

	const day = (ms: number) =>
		new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
</script>

<svelte:head>
	<title>{data.artifact.title} · {data.community.name}</title>
</svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<h1 class="text-page font-medium">{data.artifact.title}</h1>
	<p class="text-fg-muted text-meta mt-1">
		{#if data.artifact.layer !== null}Layer {data.artifact.layer} ·{/if}
		{data.artifact.standard.id} v{data.artifact.standard.version}
	</p>

	{#each data.artifact.sections as section (section.key)}
		<section class="mt-8" aria-labelledby={section.key}>
			<h2 id={section.key} class="text-section font-medium">{section.title}</h2>
			{#if section.blocks}
				<Markdown blocks={section.blocks!} class="text-fg-secondary mt-2" />
				<p class="text-fg-muted text-meta mt-2">
					{#if section.adopted?.decisionRef}
						Adopted by {section.adopted.decisionRef} on {day(section.adopted.adoptedAt)}
					{:else if section.adopted}
						Adopted {day(section.adopted.adoptedAt)}
					{/if}
					{#if section.provisional}
						· adopted before this community had agreed how it decides
					{/if}
				</p>
			{:else}
				<p class="text-fg-muted mt-2">Not yet decided by this community.</p>
			{/if}
		</section>
	{/each}

	{#if data.artifact.localAdditions.length > 0}
		<!--
			Separated and labelled, every one of them. Leaving these out would
			misrepresent how the community actually governs itself; showing them
			unlabelled would let a reader take a house rule for a standard
			requirement.
		-->
		<section class="border-border mt-10 border-t pt-6" aria-labelledby="local">
			<h2 id="local" class="text-section font-medium">Local additions</h2>
			<p class="text-fg-muted text-meta mt-1">
				Rules this community wrote for itself, which {data.artifact.standard.id} does not ask for.
			</p>
			{#each data.artifact.localAdditions as addition (addition.title)}
				<article class="border-border bg-surface mt-3 rounded-(--radius-card) border p-4">
					<h3 class="text-fg font-medium">{addition.title}</h3>
					<Markdown blocks={addition.blocks} class="text-fg-secondary mt-2" />
					<p class="text-fg-muted text-meta mt-2">{addition.label}</p>
				</article>
			{/each}
		</section>
	{/if}
</main>
