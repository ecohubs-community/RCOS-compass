<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import Markdown from '$lib/components/ui/Markdown.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { links } from '$lib/links';
	import IconCheck from '~icons/tabler/check';
	import IconLink from '~icons/tabler/link';
	import IconSparkles from '~icons/tabler/sparkles';

	let { data, form } = $props();
	const slug = $derived(data.community.slug);

	/** Which passage's mapping form is open. One at a time is plenty. */
	let mapping = $state<string | null>(null);

	const STATE_LABEL: Record<string, string> = {
		confirmed: 'Confirmed',
		suggested: 'Suggested',
		dismissed: 'Dismissed',
		stale: 'Stale'
	};
</script>

<svelte:head><title>{data.document.filename} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<p class="text-fg-muted text-meta">
		<a href={links.documents(slug)} class="hover:text-fg underline underline-offset-2">Documents</a>
	</p>
	<h1 class="text-page mt-1 font-medium">{data.document.filename}</h1>
	<p class="text-fg-secondary mt-1">
		<a href={links.documentFile(slug, data.document.id)} class="underline underline-offset-2"
			>Download the original</a
		>
		{#if data.document.pagesTotal}
			· {data.document.pagesExtracted ?? 0} of {data.document.pagesTotal} pages read
		{/if}
	</p>

	{#if data.document.statusDetail}
		<p
			class="border-attention/40 bg-attention-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			{data.document.statusDetail}
		</p>
	{/if}

	{#if data.ai.offer}
		<form method="POST" action="?/suggest" class="mt-6" use:enhance>
			<Button type="submit" variant="secondary" icon={IconSparkles}>Suggest mappings</Button>
			<p class="text-fg-muted text-meta mt-2">
				Compass reads the passages and points at requirements they might answer. Every suggestion is
				yours to confirm or dismiss — nothing is recorded until you say so.
			</p>
		</form>
	{:else if data.ai.reason}
		<!-- Not an error. Unavailable is a state this screen is designed for. -->
		<p class="text-fg-secondary mt-6">{data.ai.reason}</p>
	{/if}

	{#if form?.step === 'suggest' && !form.error}
		<p
			role="status"
			class="border-border bg-raised text-fg mt-4 rounded-(--radius-card) border p-3"
		>
			Compass is scanning this document. Suggestions appear here as it reads.
		</p>
	{/if}

	{#if data.document.status === 'uploaded' || data.document.status === 'extracting'}
		<p role="status" class="text-fg-secondary mt-6">
			Compass is reading this document. The passages appear here when it is done.
		</p>
	{:else if data.passages.length === 0}
		<p class="text-fg-secondary mt-6">There are no readable passages in this document.</p>
	{:else}
		<!--
			The passages, in place. Each is the community's own text, parsed to the
			same node tree everything a member writes goes through — no HTML sink,
			whatever the document contained.
		-->
		<ol class="mt-6 flex flex-col gap-4">
			{#each data.passages as entry (entry.id)}
				<li>
					<article class="border-border rounded-(--radius-card) border p-4">
						<p class="text-fg-muted text-meta">Page {entry.page}</p>
						<Markdown blocks={entry.blocks} class="mt-1" />

						{#if entry.evidence.length > 0}
							<ul class="mt-3 flex flex-wrap gap-2">
								{#each entry.evidence as claim (claim.id)}
									<li
										class="border-border text-meta flex items-center gap-2 rounded-full border px-2.5 py-0.5"
									>
										<span data-tabular>{claim.clauseRef}</span>
										<span
											class={claim.state === 'confirmed'
												? 'text-accent-fg'
												: claim.state === 'stale'
													? 'text-attention'
													: 'text-fg-muted'}>{STATE_LABEL[claim.state]}</span
										>
										{#if claim.state === 'confirmed' && data.can.draft}
											<form method="POST" action="?/draft" use:enhance>
												<input type="hidden" name="evidenceId" value={claim.id} />
												<button
													type="submit"
													class="text-fg cursor-pointer underline underline-offset-2"
													>Turn this into a definition</button
												>
											</form>
										{/if}
										{#if claim.state === 'suggested' && data.can.map}
											{#if claim.suggestedBy === 'ai'}
												<span class="text-fg-muted">suggested</span>
											{/if}
											<form method="POST" action="?/confirm" use:enhance>
												<input type="hidden" name="evidenceId" value={claim.id} />
												<button
													type="submit"
													class="text-accent-fg cursor-pointer underline underline-offset-2"
													>Confirm</button
												>
											</form>
											<form method="POST" action="?/dismiss" use:enhance>
												<input type="hidden" name="evidenceId" value={claim.id} />
												<button
													type="submit"
													class="text-fg-muted hover:text-fg cursor-pointer underline underline-offset-2"
													>Dismiss</button
												>
											</form>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}

						{#if data.can.map && entry.kind === 'paragraph'}
							{#if mapping === entry.id}
								<section
									class="border-border bg-raised mt-3 rounded-(--radius-control) border p-3"
									aria-labelledby="map-{entry.id}"
								>
									<h2 id="map-{entry.id}" class="text-fg font-medium">Map this passage</h2>
									<form
										method="POST"
										action="?/map"
										class="mt-2 flex flex-wrap items-end gap-2"
										use:enhance
									>
										<input type="hidden" name="passageId" value={entry.id} />
										<TextField id="clause-{entry.id}" name="clause" label="Clause" class="w-44" />
										<Button type="submit" variant="primary" icon={IconCheck}>Confirm</Button>
										<button
											type="button"
											class="text-fg-secondary hover:text-fg cursor-pointer underline underline-offset-2"
											onclick={() => (mapping = null)}>Cancel</button
										>
									</form>
									{#if form?.step === 'map' && form.error}
										<p role="alert" class="text-danger mt-2">{form.error}</p>
									{/if}
								</section>
							{:else}
								<Button
									variant="secondary"
									class="mt-3"
									onclick={() => (mapping = entry.id)}
									icon={IconLink}>Map to a clause</Button
								>
							{/if}
						{/if}
					</article>
				</li>
			{/each}
		</ol>
	{/if}
</main>
