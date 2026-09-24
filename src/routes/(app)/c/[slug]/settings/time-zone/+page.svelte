<script lang="ts">
	import TimeZonePanel from '$lib/components/account/TimeZonePanel.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
</script>

<svelte:head><title>{m.nav_time_zone()} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-6xl px-6 py-8">
	<h1 class="text-page mb-2 font-medium">{m.nav_time_zone()}</h1>
	<TimeZonePanel {data} {form} />
</main>
