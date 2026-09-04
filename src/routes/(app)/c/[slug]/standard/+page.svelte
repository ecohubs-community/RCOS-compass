<script lang="ts">
	import StatusChip from '$lib/components/ui/StatusChip.svelte';
	import { links } from '$lib/links';

	let { data } = $props();
	const slug = $derived(data.community.slug);
</script>

<svelte:head><title>Standard · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-5xl px-6 py-8">
	<h1 class="text-page font-medium">The standard</h1>
	{#if data.counts}
		<p class="text-fg-secondary mt-2">
			{data.counts.clauses} clauses · {data.counts.mandatoryArtifacts} mandatory artifacts. You have
			answered {data.counts.satisfied} sections.
		</p>
	{/if}

	<!-- A GET form: a filtered view is a URL someone can send to another member. -->
	<form method="GET" class="mt-5">
		<label class="flex w-fit items-center gap-2">
			<input type="checkbox" name="gaps" value="1" checked={data.filters.gapsOnly} />
			<span>Show only what is still unanswered</span>
		</label>
		<noscript><button type="submit" class="mt-2 underline">Apply</button></noscript>
	</form>

	{#each data.artifacts as artifact (artifact.key)}
		<section class="mt-8" aria-labelledby={artifact.key}>
			<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h2 id={artifact.key} class="text-section font-medium">{artifact.title}</h2>
				{#if artifact.layer !== null}
					<span class="text-fg-muted text-meta">Layer {artifact.layer}</span>
				{/if}
				{#if !artifact.mandatory}
					<span class="text-fg-muted text-meta">optional</span>
				{/if}
				<span class="text-fg-secondary text-meta ml-auto" data-tabular>
					{artifact.answered} of {artifact.authored} sections
				</span>
			</div>

			{#if artifact.filledByPlatform > 0}
				<p class="text-fg-muted text-meta mt-1">
					Its Ratification Record is written from the decision that adopted it — nothing for anyone
					to fill in.
				</p>
			{/if}

			<ul class="border-border mt-3 divide-y divide-(--color-border) rounded-(--radius-card) border">
				{#each artifact.sections as section (section.key)}
					<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
						{#if section.definitionId}
							<a
								href={links.definition(slug, section.definitionId)}
								class="text-fg min-w-0 flex-1 truncate underline underline-offset-2"
								>{section.title}</a
							>
						{:else}
							<span class="text-fg min-w-0 flex-1 truncate">{section.title}</span>
						{/if}
						<span class="text-fg-muted text-meta" data-tabular>
							{section.refs.length > 0 ? section.refs.join(' · ') : 'no clause'}
						</span>
						<StatusChip
							status={section.status === 'adopted'
								? 'adopted'
								: section.status === 'drafting'
									? 'drafting'
									: 'not_started'}
						/>
						{#if section.provisional}
							<StatusChip modifier="provisional" />
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<p class="text-fg-secondary mt-8">
			Nothing to show. Either this community has answered everything, or it has not adopted a
			standard yet.
		</p>
	{/each}
</main>
