<script lang="ts">
	import TwoFactorPanel from '$lib/components/account/TwoFactorPanel.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
</script>

<svelte:head><title>{m.nav_two_factor()} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">{m.nav_two_factor()}</h1>
	<p class="text-fg-secondary mt-2">{data.email}</p>
	<TwoFactorPanel {data} {form} />
</main>
