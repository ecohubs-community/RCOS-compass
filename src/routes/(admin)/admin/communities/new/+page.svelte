<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/ui/Button.svelte';
	import TextField from '$lib/components/ui/TextField.svelte';

	let { form } = $props();
	let pending = $state(false);
</script>

<svelte:head><title>New community · RCOS Compass</title></svelte:head>

<main class="mx-auto max-w-2xl px-6 py-8">
	<h1 class="text-page font-medium">New community</h1>
	<p class="text-fg-secondary mt-2">
		Creates the community and emails its owner an invitation. You do not become a member — the
		community shows as <em>pending owner</em> until someone accepts.
	</p>

	{#if form?.error}
		<p
			role="alert"
			class="border-danger/40 bg-danger-subtle text-danger mt-5 rounded-(--radius-control) border px-3 py-2"
		>
			{form.error}
		</p>
	{/if}

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
		<TextField id="name" name="name" label="Name" required value={form?.values?.name ?? ''} />
		<TextField
			id="slug"
			name="slug"
			label="Address"
			hint="Lowercase letters, numbers and single hyphens; 3–40 characters. Members visit /c/<slug>."
			required
			value={form?.values?.slug ?? ''}
		/>
		<TextField
			id="ownerEmail"
			name="ownerEmail"
			label="Owner's email"
			type="email"
			hint="They are invited as a steward carrying the owner flag."
			required
			value={form?.values?.ownerEmail ?? ''}
		/>
		<div class="grid gap-4 sm:grid-cols-2">
			<TextField
				id="locale"
				name="locale"
				label="Locale"
				hint="Language for the community's own content."
				value={form?.values?.locale ?? 'en'}
			/>
			<TextField
				id="timezone"
				name="timezone"
				label="Timezone"
				hint="Decision references are year-stamped in it."
				value={form?.values?.timezone ?? 'UTC'}
			/>
		</div>

		<div class="mt-2 flex items-center gap-3">
			<Button type="submit" variant="primary" {pending}>
				{pending ? 'Creating' : 'Create and invite'}
			</Button>
			<a
				href={resolve('/(admin)/admin/communities')}
				class="text-fg-secondary hover:text-fg underline underline-offset-2">Cancel</a
			>
		</div>
	</form>
</main>
