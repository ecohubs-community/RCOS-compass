<script lang="ts">
	import AccountPanel from '$lib/components/account/AccountPanel.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
</script>

<svelte:head><title>Account · Instance administration</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page font-medium">Account</h1>
	<p class="text-fg-secondary mt-2 mb-6">{m.account_intro()}</p>
	<AccountPanel {data} {form} />
</main>
