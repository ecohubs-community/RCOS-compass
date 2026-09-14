<script lang="ts">
	import { useTime } from '$lib/time/use-time';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';
	import IconDownload from '~icons/tabler/download';

	let { data, form } = $props();

	/**
	 * The export is a job, so the page has to come back for the result.
	 *
	 * A bounded poll rather than a socket or a spinner that never resolves: a
	 * community's whole governance is a few hundred kilobytes and the worker
	 * wakes every few seconds, so this is over in one or two rounds. If it is
	 * not, the message says to reload rather than pretending to still be working.
	 */
	let waiting = $state(false);

	async function waitForIt() {
		waiting = true;
		const started = data.exports.length;
		for (let attempt = 0; attempt < 10; attempt += 1) {
			await new Promise((resolve) => setTimeout(resolve, 1500));
			await invalidateAll();
			if (data.exports.length > started) break;
		}
		waiting = false;
	}

	const time = useTime();
	const when = (ms: number) => time.moment(ms, 'dateTimeShort');
	const size = (bytes: number) =>
		bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
</script>

<svelte:head><title>Export · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">Export everything</h1>
	<p class="text-fg-secondary mt-2">
		Your definitions, decisions and documents as plain Markdown and JSON, in one file. It opens
		without Compass, without an account and without an internet connection — which is the point.
	</p>
	<p class="text-fg-muted text-meta mt-2">
		The bundle contains what you can see. If something is restricted from you, it is not in there,
		and the bundle says so.
	</p>

	<form
		method="POST"
		action="?/export"
		use:enhance={() =>
			async ({ update }) => {
				await update();
				await waitForIt();
			}}
		class="mt-5"
	>
		<button
			type="submit"
			class="bg-accent-solid hover:bg-accent-solid-hover text-white inline-flex h-9 cursor-pointer items-center gap-2 rounded-(--radius-control) px-3 font-medium"
			><IconDownload class="h-4 w-4 flex-none" aria-hidden="true" />Export this community</button
		>
	</form>

	{#if waiting}
		<p role="status" class="text-fg-secondary mt-3">{m.export_preparing()}</p>
	{:else if form?.queued}
		<p role="status" class="text-fg-secondary mt-3">
			Your export is being prepared. If it has not appeared below, reload this page.
		</p>
	{/if}

	<section class="mt-8" aria-labelledby="ready">
		<h2 id="ready" class="text-section font-medium">Ready to download</h2>
		{#if data.exports.length === 0}
			<p class="text-fg-secondary mt-2">Nothing yet.</p>
		{:else}
			<p class="text-fg-muted text-meta mt-1">
				Each link works for {data.linkMinutes} minutes — long enough to send to somebody, short enough
				not to sit in a mail thread forever. Reload this page for a fresh one.
			</p>
			<ul class="mt-3 flex flex-col gap-2">
				{#each data.exports as file (file.id)}
					<li class="border-border/60 flex flex-wrap items-baseline gap-x-3 border-b pb-2">
						<a
							href={resolve('/download/[token]', { token: file.token })}
							class="text-fg min-w-0 flex-1 truncate underline underline-offset-2"
							>Download {file.filename}</a
						>
						<span class="text-fg-muted text-meta" data-tabular>{size(file.bytes)}</span>
						<span class="text-fg-muted text-meta" data-tabular>{when(file.createdAt)}</span>
						<span class="text-fg-muted text-meta">{file.levels.join(', ')}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
