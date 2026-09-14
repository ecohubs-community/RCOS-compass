<script lang="ts">
	import { enhance } from '$app/forms';
	import NotificationList from '$lib/components/notifications/NotificationList.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data } = $props();
</script>

<svelte:head><title>{m.notifications_title()} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<div class="flex flex-wrap items-baseline gap-x-4 gap-y-2">
		<h1 class="text-page min-w-0 flex-1 font-medium">{m.notifications_heading()}</h1>
		{#if data.unreadTotal > 0}
			<form method="POST" action="?/readAll" use:enhance>
				<Button type="submit" size="sm">{m.notifications_mark_all()}</Button>
			</form>
		{/if}
	</div>
	<p class="text-fg-secondary mt-2">{m.notifications_intro()}</p>

	{#if data.gone && !data.items.some((item) => item.id === data.gone)}
		<p role="status" class="text-attention mt-4">{m.notifications_gone()}</p>
	{/if}

	{#if data.items.length === 0}
		<p class="text-fg-secondary mt-8">{m.notifications_empty()}</p>
	{:else}
		<div class="border-border bg-surface mt-6 rounded-(--radius-card) border p-1.5">
			<NotificationList
				slug={data.community.slug}
				items={data.items}
				now={data.now}
				gone={data.gone}
			/>
		</div>
		{#if data.items.length >= 200}
			<p class="text-fg-muted text-meta mt-3">{m.notifications_latest()}</p>
		{/if}
	{/if}
</main>
