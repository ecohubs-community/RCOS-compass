<script lang="ts">
	import TimeZonePanel from '$lib/components/account/TimeZonePanel.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Time zone · Instance administration</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page mb-2 font-medium">Time zone</h1>
	<TimeZonePanel {data} {form} />
</main>
