<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<!--
	docs/01-server-client-contract.md §4: the shell stays so a member can navigate
	away, and the request id is shown because it is the one thing that makes a bug
	report actionable.
-->
<svelte:head>
	<title>{page.status} · RCOS Compass</title>
</svelte:head>

<main class="mx-auto max-w-2xl px-6 py-16">
	<p class="text-fg-muted text-meta">{page.status}</p>
	<h1 class="text-page mt-1 font-medium">{page.error?.message ?? 'Something went wrong.'}</h1>

	{#if page.error?.requestId}
		<p class="text-fg-secondary text-meta mt-4">
			Reference <code class="text-fg">{page.error.requestId}</code> — quote it if you report this.
		</p>
	{/if}

	<p class="mt-8">
		<a class="text-accent-fg underline underline-offset-2" href={resolve('/')}>Back to the start</a>
	</p>
</main>
