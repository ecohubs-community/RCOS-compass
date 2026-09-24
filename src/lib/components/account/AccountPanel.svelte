<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import IconDeviceFloppy from '~icons/tabler/device-floppy';

	/**
	 * The account itself: its name, its address, and the one irreversible thing a
	 * person can do to it. `docs/03-data-model.md` §10.
	 *
	 * The erase section states what survives before it offers the button. "Your
	 * decisions stay, attributed to a number" is the sentence a community will
	 * argue about, and it is better argued about here than discovered afterwards.
	 */
	type Props = {
		data: { email: string; name: string; labels: string[]; ownsAnything: boolean };
		form: { step?: string; error?: string } | null | undefined;
	};

	let { data, form }: Props = $props();
	let pending = $state(false);
</script>

<form
	method="POST"
	action="?/rename"
	class="flex max-w-md flex-col gap-4"
	use:enhance={() => {
		pending = true;
		return async ({ update }) => {
			await update({ reset: false });
			pending = false;
		};
	}}
>
	<TextField
		id="account-name"
		name="name"
		label={m.account_name_label()}
		hint={m.account_name_hint()}
		autocomplete="name"
		required
		maxlength={100}
		value={data.name}
		error={form?.step === 'name' ? (form.error ?? '') : ''}
	/>
	<!--
		Shown, not editable yet: an address is how somebody signs in and how every
		mail reaches them, and changing it needs a verification round-trip that
		does not exist yet. `disabled` rather than `readonly`, so it is never posted.
	-->
	<TextField
		id="account-email"
		label={m.account_email_label()}
		hint={m.account_email_hint()}
		type="email"
		value={data.email}
		disabled
		class="[&_input]:text-fg-secondary [&_input]:cursor-not-allowed"
	/>
	<div class="flex items-center gap-3">
		<Button type="submit" variant="primary" icon={IconDeviceFloppy} {pending}>
			{m.account_name_save()}
		</Button>
		{#if form?.step === 'name' && !form.error}
			<p role="status" class="text-fg-secondary">{m.account_name_saved()}</p>
		{/if}
	</div>
</form>

<section
	class="border-border bg-surface mt-10 max-w-2xl rounded-(--radius-card) border p-4"
	aria-labelledby="erase-heading"
>
	<h2 id="erase-heading" class="text-section font-medium">{m.account_erase_heading()}</h2>
	<p class="text-fg-secondary mt-2">{m.account_erase_what_goes()}</p>
	<p class="text-fg-secondary mt-2">{m.account_erase_what_stays()}</p>

	{#if data.labels.length > 0}
		<p class="text-fg-muted text-meta mt-2">
			{m.account_erase_your_labels()}
			{data.labels.map((label) => `Former member (${label})`).join(' · ')}
		</p>
	{/if}

	{#if form?.step === 'erase' && form.error}
		<p role="alert" class="text-attention mt-4">{form.error}</p>
	{/if}

	{#if data.ownsAnything}
		<p class="text-attention mt-4">{m.account_erase_owner_warning()}</p>
	{:else}
		<form method="POST" action="?/erase" use:enhance class="mt-4 flex flex-col gap-3">
			<label for="confirm" class="text-fg font-medium">{m.account_erase_confirm_label()}</label>
			<input
				id="confirm"
				name="confirm"
				required
				autocomplete="off"
				class="border-border bg-raised text-fg h-9 w-40 rounded-(--radius-control) border px-3"
			/>
			<button
				type="submit"
				class="border-attention text-attention h-9 w-fit cursor-pointer rounded-(--radius-control) border px-3 font-medium"
				>{m.account_erase_button()}</button
			>
		</form>
	{/if}
</section>
