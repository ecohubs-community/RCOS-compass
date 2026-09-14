<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';

	let { data, form } = $props();

	const time = useTime();
	const day = (ms: number) => time.date(ms);
</script>

<svelte:head><title>Legal documents · Compass admin</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">Legal documents</h1>
	<p class="text-fg-secondary mt-2">
		The text lives in the repository and deploys with the code it describes. What is recorded here
		is that one exact wording was reviewed — editing a word brings the draft notice back on its own.
	</p>

	{#if form?.error}
		<p role="alert" class="text-attention mt-4">{form.error}</p>
	{/if}

	{#each data.documents as document (document.id)}
		<section class="border-border bg-surface mt-6 rounded-(--radius-card) border p-4">
			<h2 class="text-section font-medium">{document.title}</h2>
			<p class="text-fg-muted text-meta mt-1">
				{document.words} words · <code>{document.sha256.slice(0, 12)}</code>
			</p>

			{#if document.reviewed}
				<p class="text-fg-secondary mt-2">
					Reviewed {day(document.reviewed.at)}{document.reviewed.note
						? ` — ${document.reviewed.note}`
						: ''}
				</p>
			{:else}
				<p class="text-attention mt-2">Not reviewed. The page carries a draft notice.</p>
				<form method="POST" use:enhance class="mt-3 flex flex-col gap-2 sm:max-w-md">
					<input type="hidden" name="id" value={document.id} />
					<input type="hidden" name="sha256" value={document.sha256} />
					<label for="note-{document.id}" class="text-fg font-medium">Who reviewed it</label>
					<input
						id="note-{document.id}"
						name="note"
						placeholder="counsel, the operator, …"
						class="border-border bg-raised text-fg h-9 rounded-(--radius-control) border px-3"
					/>
					<Button type="submit" class="self-start">Mark this wording reviewed</Button>
				</form>
			{/if}
		</section>
	{/each}
</main>
