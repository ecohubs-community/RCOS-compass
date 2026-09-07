<script lang="ts">
	import { links } from '$lib/links';
	import GlossaryEntry from './GlossaryEntry.svelte';

	/**
	 * The term, over whatever you were reading. UI spec §4.8.
	 *
	 * Terms get hit in the middle of a sentence, and making somebody leave the
	 * page to look one up is how they stop looking them up. Mounted once in the
	 * community shell and opened by any link carrying `data-glossary-term`.
	 *
	 * Every one of those links is a real link to the glossary page first: with no
	 * JavaScript, or before hydration, clicking one goes there and lands on the
	 * term's own anchor. The panel is the enhancement, never the mechanism.
	 */
	let { slug }: { slug: string } = $props();

	type Entry = Parameters<typeof GlossaryEntry>[1]['entry'];

	let dialog = $state<HTMLDialogElement | null>(null);
	let entry = $state<Entry | null>(null);
	let failed = $state(false);

	async function open(key: string) {
		entry = null;
		failed = false;
		dialog?.showModal();
		try {
			const response = await fetch(`/c/${slug}/glossary/${encodeURIComponent(key)}`);
			if (!response.ok) throw new Error(String(response.status));
			entry = (await response.json()) as Entry;
		} catch {
			// The link underneath still works; say so rather than showing a spinner
			// that never resolves.
			failed = true;
		}
	}

	/**
	 * Capture phase, deliberately.
	 *
	 * SvelteKit's own router listens for clicks on internal links and calls
	 * `preventDefault()` to navigate on the client. Bubbling, this handler ran
	 * second, saw `defaultPrevented` and stood down — and the term opened as a
	 * page instead of a panel, which looks exactly like the panel not existing.
	 */
	function onclickcapture(event: MouseEvent) {
		// Modified clicks belong to the browser: a term somebody opens in a new tab
		// should be the glossary page, not a dialog they cannot see.
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		const link = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-glossary-term]');
		if (!link) return;

		event.preventDefault();
		void open(link.dataset.glossaryTerm!);
	}
</script>

<svelte:document {onclickcapture} />

<dialog
	bind:this={dialog}
	aria-label="Glossary term"
	class="bg-surface text-fg m-0 ml-auto h-full max-h-none w-full max-w-md p-0 backdrop:bg-black/40 sm:w-[28rem]"
>
	<div class="flex h-full flex-col">
		<div class="border-border flex flex-none items-center justify-between border-b px-4 py-3">
			<span class="text-fg-muted text-meta">Glossary</span>
			<button
				type="button"
				onclick={() => dialog?.close()}
				class="text-fg-secondary hover:text-fg cursor-pointer underline underline-offset-2"
				>Close</button
			>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto p-4">
			{#if entry}
				<GlossaryEntry {entry} {slug} />
			{:else if failed}
				<p class="text-fg-secondary">
					That term could not be loaded. The <a
						href={links.glossary(slug)}
						class="text-fg underline underline-offset-2">glossary</a
					> has all of them.
				</p>
			{:else}
				<p class="text-fg-muted">Loading…</p>
			{/if}
		</div>
	</div>
</dialog>
