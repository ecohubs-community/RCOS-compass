<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
	let pending = $state(false);
	/** The recovery path stays out of the way until it is needed. */
	let useRecovery = $state(false);

	const submitting = () => {
		pending = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			pending = false;
		};
	};
</script>

<svelte:head><title>{m.sign_in_code_title()} · RCOS Compass</title></svelte:head>

<main class="border-border bg-surface rounded-(--radius-card) border p-6">
	<h1 class="text-section font-medium">{m.sign_in_code_heading()}</h1>
	<p class="text-fg-secondary mt-2">
		{m.sign_in_code_intro()}
	</p>

	{#if form?.error}
		<p
			role="alert"
			class="border-danger/40 bg-danger-subtle text-danger mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			{form.error}
		</p>
	{/if}

	{#if !useRecovery}
		<form method="POST" action="?/code" class="mt-5 flex flex-col gap-4" use:enhance={submitting}>
			<input type="hidden" name="redirectTo" value={data.redirectTo} />
			<TextField
				id="code"
				name="code"
				label={m.sign_in_code_label()}
				inputmode="numeric"
				autocomplete="one-time-code"
				required
				data-tabular
			/>
			<Button type="submit" variant="primary" {pending} class="w-full">
				{pending ? m.sign_in_checking() : m.sign_in_continue()}
			</Button>
		</form>

		<button
			type="button"
			class="text-fg-secondary hover:text-fg mt-4 cursor-pointer underline underline-offset-2"
			onclick={() => (useRecovery = true)}
		>
			{m.sign_in_no_authenticator()}
		</button>
	{:else}
		<form
			method="POST"
			action="?/recovery"
			class="mt-5 flex flex-col gap-4"
			use:enhance={submitting}
		>
			<input type="hidden" name="redirectTo" value={data.redirectTo} />
			<TextField
				id="recovery-code"
				name="code"
				label={m.sign_in_recovery_label()}
				hint={m.sign_in_recovery_hint()}
				autocomplete="one-time-code"
				required
			/>
			<Button type="submit" variant="primary" {pending} class="w-full">
				{pending ? m.sign_in_checking() : m.sign_in_continue()}
			</Button>
		</form>

		<button
			type="button"
			class="text-fg-secondary hover:text-fg mt-4 cursor-pointer underline underline-offset-2"
			onclick={() => (useRecovery = false)}
		>
			{m.sign_in_use_authenticator()}
		</button>
	{/if}
</main>
