<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Pilot feedback · Compass admin</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">Pilot feedback</h1>
	<p class="text-fg-secondary mt-2">
		Open reports across the instance, grouped by the screen they are about — three people confused
		by one screen is one proposal. Copy what belongs together.
	</p>

	<pre
		class="border-border bg-surface text-meta mt-6 overflow-x-auto rounded-(--radius-card) border p-4 whitespace-pre-wrap">{data.markdown}</pre>
</main>
