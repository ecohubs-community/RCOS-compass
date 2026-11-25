<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
</script>

<svelte:head><title>{m.join_requests_title()} · RCOS Compass</title></svelte:head>

<main class="border-border bg-surface rounded-(--radius-card) border p-6">
	{#if data.needsPassword}
		<h1 class="text-section font-medium">{m.join_password_heading()}</h1>
		<p class="text-fg-secondary mt-3">{m.join_password_body()}</p>
		<form method="POST" action="?/password" class="mt-4 flex flex-col gap-4" use:enhance>
			<TextField
				id="password"
				name="password"
				label={m.invitation_password_label()}
				hint={m.invitation_password_hint({ min: data.passwordMin })}
				type="password"
				autocomplete="new-password"
				required
				error={form?.errors?.password ?? ''}
			/>
			<Button type="submit" variant="primary" class="w-full">{m.join_password_submit()}</Button>
		</form>
	{:else}
		<h1 class="text-section font-medium">{m.join_waiting_heading()}</h1>
		<ul class="mt-3 flex flex-col gap-2">
			{#each data.waiting as request (request.communityName)}
				<li class="text-fg-secondary">
					{m.join_waiting_body({ community: request.communityName })}
				</li>
			{/each}
		</ul>
	{/if}
</main>
