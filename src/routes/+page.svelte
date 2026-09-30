<script lang="ts">
	import { resolve } from '$app/paths';
	import Landing from '$lib/components/landing/Landing.svelte';

	let { data } = $props();
</script>

<Landing
	appUrl={data.appUrl}
	signInHref={resolve('/(account)/sign-in')}
	contactEmail={data.contactEmail}
	account={data.account}
/>
