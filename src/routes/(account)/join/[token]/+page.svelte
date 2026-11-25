<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
	let pending = $state(false);

	const submitting: SubmitFunction = () => {
		pending = true;
		return async ({ update }) => {
			await update();
			pending = false;
		};
	};

	/** A link that stopped working while the form was open reads as dead too. */
	const dead = $derived(data.state === 'dead' || Boolean(form?.dead));
</script>

<svelte:head>
	<title
		>{!dead && data.state !== 'dead'
			? m.join_page_title({ community: data.communityName })
			: m.join_dead_title()} · RCOS Compass</title
	>
</svelte:head>

<main class="border-border bg-surface rounded-(--radius-card) border p-6">
	{#if dead || data.state === 'dead'}
		<h1 class="text-section font-medium">{m.join_dead_heading()}</h1>
		<p class="text-fg-secondary mt-3">{m.join_dead_body()}</p>
	{:else if form?.checkInbox}
		<!-- The same answer whatever is true of the address: see the server file. -->
		<h1 class="text-section font-medium">{m.join_check_heading()}</h1>
		<p role="status" class="text-fg-secondary mt-3">
			{m.join_check_body({ email: form.checkInbox, community: data.communityName })}
		</p>
	{:else if data.state === 'waiting'}
		<h1 class="text-section font-medium">{m.join_waiting_heading()}</h1>
		<p class="text-fg-secondary mt-3">
			{m.join_waiting_body({ community: data.communityName })}
		</p>
	{:else}
		<h1 class="text-section font-medium">
			{m.join_heading({ community: data.communityName })}
		</h1>
		<p class="text-fg-secondary mt-3">{m.join_intro({ community: data.communityName })}</p>

		{#if form?.full}
			<p
				role="alert"
				class="border-attention/40 bg-attention-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
			>
				{m.join_full({ community: form.full })}
			</p>
		{/if}

		{#if data.state === 'ask'}
			<p class="text-fg-muted text-meta mt-4">
				{m.invitation_signed_in_as({ email: data.signedInAs ?? '' })}
			</p>
			<form method="POST" action="?/ask" class="mt-4" use:enhance={submitting}>
				<Button type="submit" variant="primary" {pending} class="w-full">
					{pending ? m.join_submitting() : m.join_submit()}
				</Button>
			</form>
		{:else}
			<form
				method="POST"
				action="?/create"
				class="mt-4 flex flex-col gap-4"
				use:enhance={submitting}
			>
				{#if form?.errors?.form}
					<p
						role="alert"
						class="border-danger/40 bg-danger-subtle text-danger rounded-(--radius-control) border px-3 py-2"
					>
						{form.errors.form}
					</p>
				{/if}
				<TextField
					id="name"
					name="name"
					label={m.invitation_name_label()}
					hint={m.invitation_name_hint()}
					autocomplete="name"
					required
					value={form?.name ?? ''}
					error={form?.errors?.name ?? ''}
				/>
				<TextField
					id="email"
					name="email"
					label={m.join_email_label()}
					hint={m.join_email_hint()}
					type="email"
					autocomplete="email"
					required
					value={form?.email ?? ''}
					error={form?.errors?.email ?? ''}
				/>
				<Button type="submit" variant="primary" {pending} class="mt-2 w-full">
					{pending ? m.join_submitting() : m.join_submit()}
				</Button>
			</form>
			<p class="text-fg-muted text-meta mt-4">
				{m.join_have_account()}
				<a href={data.signInHref} class="text-accent-fg underline underline-offset-2">
					{m.invitation_sign_in()}
				</a>
			</p>
		{/if}
	{/if}
</main>
