<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';

	let { data, form } = $props();
	let pending = $state(false);

	const submitting = () => {
		pending = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			pending = false;
		};
	};

	let justEnrolled = $derived(page.url.searchParams.get('enrolled') === '1');
	/** Step two is reached by starting step one; a reload returns to step one. */
	let setup = $derived(form?.step === 'confirm' ? form : null);
</script>

<svelte:head><title>Two-factor authentication · RCOS Compass</title></svelte:head>

<main class="border-border bg-surface rounded-(--radius-card) border p-6">
	<h1 class="text-section font-medium">Two-factor authentication</h1>
	<p class="text-fg-secondary mt-2">{data.email}</p>

	{#if justEnrolled}
		<p
			role="status"
			class="border-accent/40 bg-accent-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			Two-factor authentication is on. You'll be asked for a code the next time you sign in.
		</p>
	{/if}

	{#if form?.error}
		<p
			role="alert"
			class="border-danger/40 bg-danger-subtle text-danger mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			{form.error}
		</p>
	{/if}

	{#if data.required && !data.state.verified}
		<p
			class="border-attention/40 bg-attention-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
		>
			This address administers the instance, so it needs a second factor before the admin console
			will open.
		</p>
	{/if}

	{#if setup}
		<!-- Step two. The secret is already stored, unverified, until a code proves it arrived. -->
		<section class="mt-6" aria-labelledby="scan">
			<h2 id="scan" class="text-title font-medium">1. Add it to your authenticator</h2>
			<p class="text-fg-secondary mt-2">
				In your authenticator app choose "add account", then "enter a setup key", and type this:
			</p>
			<p
				class="border-border bg-raised text-fg mt-3 rounded-(--radius-control) border px-3 py-2 font-mono break-all"
				data-tabular
			>
				{setup.manualKey}
			</p>
			<p class="text-fg-muted text-meta mt-2">Account: {data.email} · Issuer: RCOS Compass</p>
		</section>

		<section class="mt-8" aria-labelledby="codes">
			<h2 id="codes" class="text-title font-medium">2. Save your recovery codes</h2>
			<p class="text-fg-secondary mt-2">
				These are shown once and never again. Each one works a single time, and they are the only
				way back in if you lose the app. Write them down somewhere that is not your phone.
			</p>
			<ul
				class="border-border bg-raised mt-3 grid grid-cols-2 gap-x-6 gap-y-1 rounded-(--radius-control) border px-3 py-2 font-mono"
			>
				{#each setup.backupCodes as code (code)}
					<li data-tabular>{code}</li>
				{/each}
			</ul>
		</section>

		<section class="mt-8" aria-labelledby="confirm">
			<h2 id="confirm" class="text-title font-medium">3. Confirm</h2>
			<form
				method="POST"
				action="?/confirm"
				class="mt-3 flex flex-col gap-4"
				use:enhance={submitting}
			>
				<TextField
					id="code"
					name="code"
					label="Code from your app"
					inputmode="numeric"
					autocomplete="one-time-code"
					required
					data-tabular
				/>
				<Button type="submit" variant="primary" {pending} class="w-full">
					{pending ? 'Checking' : 'Turn on two-factor authentication'}
				</Button>
			</form>
		</section>
	{:else if data.state.verified}
		<p class="text-fg-secondary mt-6">Two-factor authentication is on for this account.</p>
		<form method="POST" action="?/remove" class="mt-4 flex flex-col gap-4" use:enhance={submitting}>
			{#if data.state.requiresPassword}
				<TextField
					id="remove-password"
					name="password"
					label="Your password"
					type="password"
					autocomplete="current-password"
					required
				/>
			{/if}
			<Button type="submit" variant="danger" {pending}>
				{pending ? 'Turning off' : 'Turn off two-factor authentication'}
			</Button>
		</form>
	{:else}
		<p class="text-fg-secondary mt-6">
			You'll need an authenticator app on your phone — any one that shows six-digit codes.
			{#if data.state.enrolled}
				A previous setup was never finished; starting again replaces it.
			{/if}
		</p>
		<form method="POST" action="?/begin" class="mt-4 flex flex-col gap-4" use:enhance={submitting}>
			{#if data.state.requiresPassword}
				<TextField
					id="password"
					name="password"
					label="Your password"
					hint="Confirming it is yours before changing how it is protected."
					type="password"
					autocomplete="current-password"
					required
				/>
			{/if}
			<Button type="submit" variant="primary" {pending}>
				{pending ? 'Starting' : 'Set up two-factor authentication'}
			</Button>
		</form>
	{/if}
</main>
