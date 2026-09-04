<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import { links } from '$lib/links';

	let { data, form } = $props();
	const slug = $derived(data.community.slug);

	const ago = (ms: number) => {
		const days = Math.floor((Date.now() - ms) / 86_400_000);
		if (days <= 0) return 'today';
		return days === 1 ? 'yesterday' : `${days} days ago`;
	};
</script>

<svelte:head><title>Discussions · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-4xl px-6 py-8">
	<h1 class="text-page font-medium">Discussions</h1>

	{#if data.canStart}
		<form
			method="POST"
			action="?/open"
			class="border-border mt-5 flex flex-wrap items-end gap-3 rounded-(--radius-card) border p-4"
			use:enhance
		>
			<TextField
				id="title"
				name="title"
				label="Start a discussion"
				class="min-w-56 flex-1"
				placeholder="What happens when someone stops showing up?"
				required
			/>
			<TextField id="clauseKey" name="clauseKey" label="Clause (optional)" class="w-44" />
			<Button type="submit" variant="primary">Start</Button>
		</form>
		{#if form?.error}
			<p role="alert" class="text-danger mt-2">{form.error}</p>
		{/if}
	{/if}

	{#if data.discussions.length === 0}
		<p class="text-fg-secondary mt-8">Nothing is being discussed yet.</p>
	{:else}
		<ul class="border-border mt-6 divide-y divide-(--color-border) rounded-(--radius-card) border">
			{#each data.discussions as thread (thread.id)}
				<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
					<a
						href={links.discussion(slug, thread.id)}
						class="text-fg min-w-0 flex-1 truncate font-medium underline underline-offset-2"
						>{thread.title}</a
					>
					{#if thread.origin === 'offline'}
						<span class="text-fg-muted text-meta">decided in a meeting</span>
					{/if}
					<span class="text-fg-secondary text-meta">{thread.status.replace('_', ' ')}</span>
					<span class="text-fg-muted text-meta">{ago(thread.lastActivityAt)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</main>
