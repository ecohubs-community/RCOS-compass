<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
	let pending = $state(false);

	/**
	 * The sentence that describes what the invitation grants, chosen by lookup
	 * rather than by comparison — the same reason `members/+page.svelte` keeps
	 * its role labels in a map. A role compared at a call site is a second copy
	 * of the vocabulary, and the linter is right to refuse one.
	 */
	const ROLE_BLURB: Record<'steward' | 'member', () => string> = {
		steward: m.invitation_role_steward,
		member: m.invitation_role_member
	};

	/**
	 * Whether the person at the keyboard is the person the invitation names.
	 * Compared lower-cased, because an address is not case-sensitive and being
	 * told "this was sent to you, but you are not you" is the worst possible
	 * version of this screen.
	 */
	let signedInAsInvited = $derived(
		data.view.kind === 'open' &&
			Boolean(data.signedInAs) &&
			data.signedInAs?.toLowerCase() === data.view.email
	);
</script>

<svelte:head>
	<title
		>{data.view.kind === 'open'
			? m.invitation_page_title({ community: data.view.communityName })
			: m.invitation_unknown_heading()} · RCOS Compass</title
	>
</svelte:head>

<main class="border-border bg-surface rounded-(--radius-card) border p-6">
	{#if data.view.kind === 'unknown'}
		<h1 class="text-section font-medium">{m.invitation_unknown_heading()}</h1>
		<p class="text-fg-secondary mt-3">{m.invitation_unknown_body()}</p>
	{:else if data.view.kind === 'expired'}
		<h1 class="text-section font-medium">{m.invitation_expired_heading()}</h1>
		<p class="text-fg-secondary mt-3">
			{m.invitation_expired_body({ days: data.expiryDays, community: data.view.communityName })}
		</p>
	{:else if data.view.kind === 'already_used'}
		<h1 class="text-section font-medium">{m.invitation_used_heading()}</h1>
		<p class="text-fg-secondary mt-3">{m.invitation_used_body()}</p>
		<a
			href={resolve('/(account)/sign-in')}
			class="text-accent-fg mt-4 inline-block underline underline-offset-2"
		>
			{m.invitation_sign_in()}
		</a>
	{:else}
		<h1 class="text-section font-medium">
			{m.invitation_heading({ community: data.view.communityName })}
		</h1>

		<p class="text-fg-secondary mt-3">
			{ROLE_BLURB[data.view.role]()}
		</p>
		{#if data.view.grantsOwner}
			<p class="text-fg-secondary mt-2">{m.invitation_owner()}</p>
		{/if}

		{#if form?.error}
			<p
				role="alert"
				class="border-danger/40 bg-danger-subtle text-danger mt-4 rounded-(--radius-control) border px-3 py-2"
			>
				{form.error}
			</p>
		{/if}

		{#if signedInAsInvited}
			<!-- The invited person, already signed in: one button between them and
			     the community that asked for them. -->
			<p class="text-fg-muted text-meta mt-4">
				{m.invitation_signed_in_as({ email: data.signedInAs ?? '' })}
			</p>
			<form
				method="POST"
				action="?/accept"
				class="mt-4"
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						await update();
						pending = false;
					};
				}}
			>
				<Button type="submit" variant="primary" {pending} class="w-full">
					{pending ? m.invitation_accepting() : m.invitation_accept()}
				</Button>
			</form>
		{:else if data.signedInAs}
			<!-- Signed in as somebody else. The invitation is bound to its address,
			     so the only way forward is out. -->
			<p class="text-fg-secondary mt-4">
				{m.invitation_wrong_address({ invited: data.view.email, current: data.signedInAs })}
			</p>
			<p class="text-fg-muted text-meta mt-2">{m.invitation_wrong_address_help()}</p>
			<form method="POST" action="/sign-out" class="mt-4">
				<Button type="submit" variant="secondary" class="w-full">
					{m.invitation_sign_out()}
				</Button>
			</form>
		{:else if data.hasAccount}
			<p class="text-fg-secondary mt-4">
				{m.invitation_sign_in_body({ email: data.view.email })}
			</p>
			<a
				href={data.signInHref}
				class="bg-accent-solid hover:bg-accent-solid-hover mt-4 inline-flex h-8 w-full items-center justify-center rounded-(--radius-control) font-medium text-white"
			>
				{m.invitation_sign_in()}
			</a>
		{:else}
			<h2 class="text-title mt-6 font-medium">{m.invitation_create_heading()}</h2>
			<p class="text-fg-secondary mt-2">
				{m.invitation_create_body({ email: data.view.email })}
			</p>

			<form
				method="POST"
				action="?/create"
				class="mt-4 flex flex-col gap-4"
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						await update();
						pending = false;
					};
				}}
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
					id="password"
					name="password"
					label={m.invitation_password_label()}
					hint={m.invitation_password_hint({ min: data.passwordMin })}
					type="password"
					autocomplete="new-password"
					required
					error={form?.errors?.password ?? ''}
				/>

				<Button type="submit" variant="primary" {pending} class="mt-2 w-full">
					{pending ? m.invitation_creating() : m.invitation_create_submit()}
				</Button>
			</form>

			<p class="text-fg-muted text-meta mt-4">
				{m.invitation_have_account()}
				<a href={data.signInHref} class="text-accent-fg underline underline-offset-2">
					{m.invitation_sign_in()}
				</a>
			</p>
		{/if}
	{/if}
</main>
