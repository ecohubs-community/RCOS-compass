<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import { links } from '$lib/links';
	import IconUpload from '~icons/tabler/upload';

	let { data, form } = $props();
	const slug = $derived(data.community.slug);

	const STATUS: Record<string, string> = {
		uploaded: 'Waiting to be read',
		extracting: 'Reading it',
		extracted: 'Extracted',
		reference_only: 'Kept, but not readable',
		failed: 'Could not be read'
	};

	const size = (bytes: number) =>
		bytes < 1024 * 1024
			? `${Math.round(bytes / 1024)} KB`
			: `${(bytes / 1024 / 1024).toFixed(1)} MB`;
</script>

<svelte:head><title>Documents · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">Documents</h1>
	<p class="text-fg-secondary mt-2">
		Governance you have already written. Compass reads it, you map the parts that answer a clause,
		and those become definitions in your own words.
	</p>

	{#if data.can.upload}
		<form
			method="POST"
			action="?/upload"
			enctype="multipart/form-data"
			class="border-border mt-6 flex flex-col gap-3 rounded-(--radius-card) border p-4"
			use:enhance
		>
			<label for="file" class="text-fg font-medium">Upload a document</label>
			<!--
				Said before a file is chosen, not after it is stored. Uploaded bylaws
				can carry names and addresses, every member can read them, and the
				machinery for restricting that is P6 — so the honest thing for now is
				a stated default rather than a quiet one.
			-->
			<p class="text-fg-muted text-meta">
				Every member of your community will be able to read this. PDF, Word, OpenDocument, Markdown
				or plain text, up to {data.maxMb} MB.
			</p>
			<input
				id="file"
				name="file"
				type="file"
				accept={data.accepts}
				required
				class="border-border bg-raised text-fg rounded-(--radius-control) border p-2"
			/>
			<Button type="submit" variant="primary" icon={IconUpload} class="self-start">Upload</Button>
			{#if form?.error}<p role="alert" class="text-danger">{form.error}</p>{/if}
		</form>
	{/if}

	{#if data.documents.length === 0}
		<p class="text-fg-secondary mt-8">
			Nothing yet. If your community has written agreements, bylaws or minutes, this is the shortest
			way in — you are probably further along than the dashboard says.
		</p>
	{:else}
		<ul class="mt-8 flex flex-col gap-3">
			{#each data.documents as entry (entry.id)}
				<li
					class="border-border flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-(--radius-card) border p-3"
				>
					<a
						href={links.document(slug, entry.id)}
						class="text-fg font-medium underline underline-offset-2">{entry.filename}</a
					>
					<span class="text-fg-muted text-meta" data-tabular>{size(entry.bytes)}</span>
					<span class="text-fg-secondary text-meta">{STATUS[entry.status] ?? entry.status}</span>
					{#if entry.pagesTotal && entry.pagesExtracted && entry.pagesExtracted < entry.pagesTotal}
						<span class="text-attention text-meta">
							{entry.pagesExtracted} of {entry.pagesTotal} pages read
						</span>
					{/if}
					{#if entry.statusDetail}
						<p class="text-fg-secondary w-full">{entry.statusDetail}</p>
					{/if}
					{#if data.can.destroy}
						<form method="POST" action="?/remove" class="ml-auto" use:enhance>
							<input type="hidden" name="documentId" value={entry.id} />
							<button
								type="submit"
								class="text-fg-muted hover:text-danger text-meta cursor-pointer underline underline-offset-2"
								>Delete</button
							>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>
