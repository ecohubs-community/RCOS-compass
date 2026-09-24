<script lang="ts">
	import TwoFactorPanel from '$lib/components/account/TwoFactorPanel.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>Two-factor authentication · Instance administration</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">Two-factor authentication</h1>
	<p class="text-fg-secondary mt-2">{data.email}</p>
	<TwoFactorPanel {data} {form} />
</main>
