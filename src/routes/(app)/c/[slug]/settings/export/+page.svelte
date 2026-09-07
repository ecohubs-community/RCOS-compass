<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';

	let { data, form } = $props();

	const when = (ms: number) =>
		new Date(ms).toLocaleString('en-GB', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	const size = (bytes: number) =>
		bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
</script>

<svelte:head><title>Export · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<h1 class="text-page font-medium">Export everything</h1>
	<p class="text-fg-secondary mt-2">
		Your definitions, decisions and documents as plain Markdown and JSON, in one file. It opens
		without Compass, without an account and without an internet connection — which is the point.
	</p>
	<p class="text-fg-muted text-meta mt-2">
		The bundle contains what you can see. If something is restricted from you, it is not in there,
		and the bundle says so.
	</p>

	<form method="POST" action="?/export" use:enhance class="mt-5">
		<button
			type="submit"
			class="bg-accent-deep text-fg h-9 cursor-pointer rounded-(--radius-control) px-3 font-medium"
			>Export this community</button
		>
	</form>

	{#if form?.queued}
		<p role="status" class="text-fg-secondary mt-3">
			Preparing your export — it will appear below in a moment. You will be notified when it is
			ready.
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
							>{file.filename}</a
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
