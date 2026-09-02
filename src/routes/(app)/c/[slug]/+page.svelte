<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>{data.community.name} · RCOS Compass</title></svelte:head>

<main class="mx-auto max-w-4xl px-6 py-10">
	<h1 class="text-page font-medium">{data.community.name}</h1>
	<p class="text-fg-secondary mt-2">
		Signed in as {data.membership.role}{data.membership.isOwner ? ' · owner' : ''}.
	</p>
</main>
