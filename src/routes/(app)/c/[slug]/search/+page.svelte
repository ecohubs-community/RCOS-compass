<script lang="ts">
	import { links } from '$lib/links';

	let { data } = $props();
	const slug = $derived(data.community.slug);

	/** Through `links`, so a renamed route breaks the build rather than a link. */
	const hrefOf = (hit: {
		kind: string;
		subjectId: string;
		ref: string | null;
		documentId: string | null;
	}) => {
		if (hit.kind === 'decision') return hit.ref ? links.decision(slug, hit.ref) : null;
		if (hit.kind === 'definition') return links.definition(slug, hit.subjectId);
		if (hit.kind === 'discussion') return links.discussion(slug, hit.subjectId);
		return hit.documentId ? links.document(slug, hit.documentId) : null;
	};

	const KIND_LABEL: Record<string, string> = {
		decision: 'Decision',
		definition: 'Definition',
		discussion: 'Discussion',
		passage: 'Document'
	};
</script>

<svelte:head><title>Search · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-4xl px-6 py-8">
	<h1 class="text-page font-medium">Search</h1>
	<p class="text-fg-secondary mt-2">
		Ask what you would ask a person. This finds the rules that govern it — the standard's clauses
		and what this community has decided. It does not answer the question.
	</p>

	<form method="GET" class="mt-5 flex flex-wrap gap-2">
		<input
			type="search"
			name="q"
			value={data.question}
			placeholder="Can we spend €800 on the water pump?"
			aria-label="Search this community's governance"
			class="border-border bg-raised text-fg h-9 min-w-0 flex-1 rounded-(--radius-control) border px-3"
		/>
		<button
			type="submit"
			class="bg-raised border-border hover:border-border-strong h-9 cursor-pointer rounded-(--radius-control) border px-3 font-medium"
			>Search</button
		>
	</form>

	{#if data.asked}
		<!--
			What was actually searched for, always. An empty result that does not say
			this reads as a broken feature; saying it lets a member see that it looked
			for "water" and "pump" and found nothing, which is a different fact.
		-->
		<p class="text-fg-muted text-meta mt-3">
			{#if data.terms.length > 0}
				Searched for: {data.terms.join(', ')}
			{:else}
				Nothing in that question was specific enough to search for.
			{/if}
			{#if data.ignored.length > 0}
				· Too common to narrow anything: {data.ignored.join(', ')}
			{/if}
		</p>
	{/if}

	{#if data.asked && data.clauses.length === 0 && data.ours.length === 0}
		<p class="text-fg-secondary mt-8">
			Nothing in the standard or in this community's records uses those words.
		</p>
	{/if}

	{#if data.clauses.length > 0}
		<section class="mt-8" aria-labelledby="from-the-standard">
			<h2 id="from-the-standard" class="text-section font-medium">What the standard says</h2>
			<ul class="mt-3 flex flex-col gap-3">
				{#each data.clauses as clause (clause.key)}
					<li class="border-border bg-surface rounded-(--radius-card) border p-4">
						<div class="flex flex-wrap items-baseline gap-2">
							<span class="text-fg font-medium" data-tabular>{clause.ref}</span>
							{#if clause.sectionTitle}
								<span class="text-fg-secondary">{clause.sectionTitle}</span>
							{/if}
							<span class="text-fg-muted text-meta ml-auto">Layer {clause.layer}</span>
						</div>
						<p class="text-fg-secondary mt-2">{clause.text}</p>
						{#if clause.definitionId}
							<p class="mt-2">
								<a
									href={links.definition(slug, clause.definitionId)}
									class="text-fg underline underline-offset-2">What this community decided</a
								>
							</p>
						{:else if clause.sectionKey}
							<p class="text-fg-muted text-meta mt-2">
								This community has not answered this yet.
								<!--
									eslint-disable svelte/no-navigation-without-resolve --
									`links.startDiscussion` is a `resolve` with the clause appended
									as a query. The rule reads the attribute rather than where the
									value came from, so it cannot see that.
								-->
								<a
									href={links.startDiscussion(slug, clause.key)}
									class="text-fg underline underline-offset-2">Start the discussion</a
								>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.ours.length > 0}
		<section class="mt-8" aria-labelledby="from-this-community">
			<h2 id="from-this-community" class="text-section font-medium">What this community has</h2>
			<ul class="mt-3 flex flex-col gap-3">
				{#each data.ours as hit (hit.subjectId)}
					{@const href = hrefOf(hit)}
					<li class="border-border bg-surface rounded-(--radius-card) border p-4">
						<div class="flex flex-wrap items-baseline gap-2">
							<span class="text-fg-muted text-meta">{KIND_LABEL[hit.kind] ?? hit.kind}</span>
							{#if hit.ref}
								<span class="text-fg-secondary text-meta" data-tabular>{hit.ref}</span>
							{/if}
						</div>
						<p class="mt-1">
							{#if href}
								<a {href} class="text-fg font-medium underline underline-offset-2">{hit.title}</a>
							{:else}
								<span class="text-fg font-medium">{hit.title}</span>
							{/if}
						</p>
						{#if hit.excerpt}
							<!-- Their words, quoted. Nothing here is written by Compass. -->
							<p class="text-fg-secondary mt-2">{hit.excerpt}</p>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>
