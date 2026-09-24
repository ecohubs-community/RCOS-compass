<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import * as m from '$lib/paraglide/messages';

	/**
	 * Enrolling a second factor, and removing it. openspec `authentication`.
	 *
	 * In the community's language under its settings; in the console, which has
	 * no language of its own, in the base one.
	 */
	type Props = {
		data: {
			email: string;
			state: { verified: boolean; enrolled: boolean; requiresPassword: boolean };
			required: boolean;
		};
		form:
			| { step?: string; error?: string; manualKey?: string | null; backupCodes?: string[] }
			| null
			| undefined;
	};

	let { data, form }: Props = $props();
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
	let setup = $derived(
		form?.step === 'confirm' && form.backupCodes
			? { manualKey: form.manualKey ?? '', backupCodes: form.backupCodes }
			: null
	);
</script>

{#if justEnrolled}
	<p
		role="status"
		class="border-accent/40 bg-accent-subtle text-fg mt-4 rounded-(--radius-control) border px-3 py-2"
	>
		{m.two_factor_enrolled()}
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
		{m.two_factor_required()}
	</p>
{/if}

{#if setup}
	<!-- Step two. The secret is already stored, unverified, until a code proves it arrived. -->
	<section class="mt-6" aria-labelledby="scan">
		<h2 id="scan" class="text-title font-medium">{m.two_factor_step_add()}</h2>
		<p class="text-fg-secondary mt-2">
			{m.two_factor_step_add_body()}
		</p>
		<p
			class="border-border bg-raised text-fg mt-3 rounded-(--radius-control) border px-3 py-2 font-mono break-all"
			data-tabular
		>
			{setup.manualKey}
		</p>
		<p class="text-fg-muted text-meta mt-2">{m.two_factor_account_line({ email: data.email })}</p>
	</section>

	<section class="mt-8" aria-labelledby="codes">
		<h2 id="codes" class="text-title font-medium">{m.two_factor_step_codes()}</h2>
		<p class="text-fg-secondary mt-2">
			{m.two_factor_step_codes_body()}
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
		<h2 id="confirm" class="text-title font-medium">{m.two_factor_step_confirm()}</h2>
		<form
			method="POST"
			action="?/confirm"
			class="mt-3 flex flex-col gap-4"
			use:enhance={submitting}
		>
			<TextField
				id="code"
				name="code"
				label={m.two_factor_code_label()}
				inputmode="numeric"
				autocomplete="one-time-code"
				required
				data-tabular
			/>
			<Button type="submit" variant="primary" {pending} class="w-full">
				{pending ? m.two_factor_checking() : m.two_factor_turn_on()}
			</Button>
		</form>
	</section>
{:else if data.state.verified}
	<p class="text-fg-secondary mt-6">{m.two_factor_is_on()}</p>
	<form method="POST" action="?/remove" class="mt-4 flex flex-col gap-4" use:enhance={submitting}>
		{#if data.state.requiresPassword}
			<TextField
				id="remove-password"
				name="password"
				label={m.two_factor_password_label()}
				type="password"
				autocomplete="current-password"
				required
			/>
		{/if}
		<Button type="submit" variant="danger" {pending}>
			{pending ? m.two_factor_turning_off() : m.two_factor_turn_off()}
		</Button>
	</form>
{:else}
	<p class="text-fg-secondary mt-6">
		{m.two_factor_need_app()}
		{#if data.state.enrolled}
			{m.two_factor_unfinished()}
		{/if}
	</p>
	<form method="POST" action="?/begin" class="mt-4 flex flex-col gap-4" use:enhance={submitting}>
		{#if data.state.requiresPassword}
			<TextField
				id="password"
				name="password"
				label={m.two_factor_password_label()}
				hint={m.two_factor_password_hint()}
				type="password"
				autocomplete="current-password"
				required
			/>
		{/if}
		<Button type="submit" variant="primary" {pending}>
			{pending ? m.two_factor_starting() : m.two_factor_set_up()}
		</Button>
	</form>
{/if}
