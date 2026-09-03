<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';

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

<svelte:head><title>Two-factor code · RCOS Compass</title></svelte:head>

<main class="border-border bg-surface rounded-(--radius-card) border p-6">
	<h1 class="text-section font-medium">Enter your code</h1>
	<p class="text-fg-secondary mt-2">
		Open your authenticator app and enter the six-digit code it shows for RCOS Compass.
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
				label="Six-digit code"
				inputmode="numeric"
				autocomplete="one-time-code"
				required
				data-tabular
			/>
			<Button type="submit" variant="primary" {pending} class="w-full">
				{pending ? 'Checking' : 'Continue'}
			</Button>
		</form>

		<button
			type="button"
			class="text-fg-secondary hover:text-fg mt-4 cursor-pointer underline underline-offset-2"
			onclick={() => (useRecovery = true)}
		>
			I don't have my authenticator
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
				label="Recovery code"
				hint="One of the codes you saved when you set this up. Each one works once."
				autocomplete="one-time-code"
				required
			/>
			<Button type="submit" variant="primary" {pending} class="w-full">
				{pending ? 'Checking' : 'Continue'}
			</Button>
		</form>

		<button
			type="button"
			class="text-fg-secondary hover:text-fg mt-4 cursor-pointer underline underline-offset-2"
			onclick={() => (useRecovery = false)}
		>
			Use my authenticator instead
		</button>
	{/if}
</main>
