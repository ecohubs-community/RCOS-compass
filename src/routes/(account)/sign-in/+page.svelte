<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';

	let { data, form } = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Sign in · RCOS Compass</title></svelte:head>

<main class="border-border bg-surface rounded-(--radius-card) border p-6">
	<h1 class="text-section font-medium">Sign in</h1>

	<form
		method="POST"
		class="mt-6 flex flex-col gap-4"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				await update();
				pending = false;
			};
		}}
	>
		<input type="hidden" name="redirectTo" value={data.redirectTo} />

		{#if form?.errors?.form}
			<p
				role="alert"
				class="border-danger/40 bg-danger-subtle text-danger rounded-(--radius-control) border px-3 py-2"
			>
				{form.errors.form}
			</p>
		{/if}

		<TextField
			id="email"
			name="email"
			label="Email"
			type="email"
			autocomplete="username"
			required
			value={form?.email ?? ''}
			error={form?.errors?.email ?? ''}
		/>
		<TextField
			id="password"
			name="password"
			label="Password"
			type="password"
			autocomplete="current-password"
			required
			error={form?.errors?.password ?? ''}
		/>

		<Button type="submit" variant="primary" {pending} class="mt-2 w-full">
			{pending ? 'Signing in' : 'Sign in'}
		</Button>
	</form>
</main>
