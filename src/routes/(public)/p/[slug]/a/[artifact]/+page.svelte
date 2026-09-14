<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();

	const time = useTime();
	const day = (ms: number) => time.date(ms);
</script>

<svelte:head>
	<title>{data.artifact.title} · {data.community.name}</title>
</svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
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
				<p class="text-fg-muted mt-2">{m.public_not_decided()}</p>
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
			<h2 id="local" class="text-section font-medium">{m.public_local_additions()}</h2>
			<p class="text-fg-muted text-meta mt-1">
				{m.public_local_note({ standard: data.artifact.standard.id })}
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
