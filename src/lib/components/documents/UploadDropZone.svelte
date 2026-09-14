<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import Button from '$lib/components/ui/Button.svelte';
	import IconUpload from '~icons/tabler/upload';

	/**
	 * The library's upload control. Design 09: a drop zone with "Browse files".
	 *
	 * **Without JavaScript** it is an ordinary multipart form: every chosen file
	 * goes in one submission, and the server answers with a line per file.
	 *
	 * **With JavaScript** a submission — or a drop — sends one request per file,
	 * in sequence. That keeps the request body at one file's ceiling (the limit
	 * every other route shares) and lets each file's outcome appear as it lands,
	 * rather than all of them after the slowest.
	 */
	type Result = { filename: string; ok: boolean; error?: string };

	type Props = {
		community: string;
		accepts: string;
		maxMb: number;
		maxFiles: number;
		/** What the server said after a no-JavaScript submission. */
		serverResults?: Result[] | null;
		serverError?: 'none' | 'too_many' | null;
	};

	let {
		community,
		accepts,
		maxMb,
		maxFiles,
		serverResults = null,
		serverError = null
	}: Props = $props();

	let form = $state<HTMLFormElement | null>(null);
	let input = $state<HTMLInputElement | null>(null);
	let results = $state<Result[]>([]);
	let progress = $state<{ current: number; total: number } | null>(null);
	let problem = $state<'none' | 'too_many' | null>(null);
	let over = $state(false);

	const shown = $derived(results.length > 0 ? results : (serverResults ?? []));
	const complaint = $derived(problem ?? serverError);

	async function send(event: SubmitEvent) {
		const files = [...(input?.files ?? [])];
		event.preventDefault();
		problem = null;
		if (files.length === 0) return void (problem = 'none');
		if (files.length > maxFiles) return void (problem = 'too_many');

		results = [];
		for (const [index, file] of files.entries()) {
			progress = { current: index + 1, total: files.length };
			const body = new FormData();
			body.append('file', file);
			try {
				const response = await fetch('?/upload', {
					method: 'POST',
					body,
					headers: { 'x-sveltekit-action': 'true' }
				});
				const outcome = deserialize(await response.text());
				if (outcome.type === 'success' && Array.isArray(outcome.data?.results)) {
					results = [...results, ...(outcome.data.results as Result[])];
				} else {
					results = [...results, { filename: file.name, ok: false, error: 'That did not work.' }];
				}
			} catch {
				results = [
					...results,
					{ filename: file.name, ok: false, error: 'The upload did not reach Compass.' }
				];
			}
		}
		progress = null;
		if (input) input.value = '';
		await invalidateAll();
	}

	function drop(event: DragEvent) {
		event.preventDefault();
		over = false;
		if (!input || !event.dataTransfer?.files.length) return;
		input.files = event.dataTransfer.files;
		form?.requestSubmit();
	}
</script>

<form
	bind:this={form}
	method="POST"
	action="?/upload"
	enctype="multipart/form-data"
	onsubmit={send}
	ondragover={(event) => {
		event.preventDefault();
		over = true;
	}}
	ondragleave={() => (over = false)}
	ondrop={drop}
	class="border-border-strong bg-surface flex flex-wrap items-center gap-x-4 gap-y-3 rounded-(--radius-card) border border-dashed px-4 py-3.5 {over
		? 'border-accent'
		: ''}"
>
	<IconUpload class="text-fg-muted h-5 w-5 flex-none" aria-hidden="true" />
	<div class="min-w-48 flex-1">
		<label for="library-files" class="text-fg">{m.library_drop_heading()}</label>
		<p class="text-fg-muted text-meta mt-0.5">{m.library_drop_examples()}</p>
		<!--
			Said before a file is chosen, not after it is stored: every member can read
			what anyone uploads, and nothing leaves the community — the second half is
			a promise the publishing service enforces.
		-->
		<p class="text-fg-secondary text-meta mt-1">{m.documents_upload_notice({ community })}</p>
		<p class="text-fg-muted text-meta mt-0.5">
			{m.library_drop_limits({ files: maxFiles, mb: maxMb })}
		</p>
	</div>
	<div class="flex flex-none items-center gap-2">
		<input
			bind:this={input}
			id="library-files"
			name="file"
			type="file"
			multiple
			accept={accepts}
			class="text-fg-secondary text-meta file:border-border-strong file:bg-raised file:text-fg max-w-56 file:mr-2 file:cursor-pointer file:rounded-(--radius-control) file:border file:px-3 file:py-1.5"
		/>
		<Button type="submit" variant="primary" icon={IconUpload} pending={progress !== null}>
			{m.library_upload_button()}
		</Button>
	</div>

	<div class="w-full" aria-live="polite">
		{#if progress}
			<p class="text-fg-secondary text-meta">
				{m.library_uploading({ current: progress.current, total: progress.total })}
			</p>
		{/if}
		{#if complaint}
			<p role="alert" class="text-danger text-meta">
				{complaint === 'too_many'
					? m.library_upload_too_many({ files: maxFiles })
					: m.library_upload_none()}
			</p>
		{/if}
		{#if shown.length > 0}
			<ul class="flex flex-col gap-1">
				{#each shown as result, index (index)}
					<li class="text-meta {result.ok ? 'text-fg-secondary' : 'text-danger'}">
						{result.ok
							? m.library_upload_ok({ filename: result.filename })
							: m.library_upload_refused({ filename: result.filename, reason: result.error ?? '' })}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</form>
