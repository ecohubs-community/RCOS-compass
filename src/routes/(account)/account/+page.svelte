<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';

	let { data, form } = $props();
</script>

<svelte:head><title>{m.account_title()}</title></svelte:head>

<main>
	<h1 class="text-page font-medium">{m.account_heading()}</h1>
	<p class="text-fg-secondary mt-2">{m.account_signed_in_as()} {data.email}</p>

	<p class="mt-4">
		<a
			href={resolve('/(account)/account/two-factor')}
			class="text-fg-secondary hover:text-fg underline underline-offset-2"
			>{m.account_two_factor_link()}</a
		>
	</p>

	<section class="border-border bg-surface mt-10 rounded-(--radius-card) border p-4">
		<h2 class="text-section font-medium">{m.account_erase_heading()}</h2>
		<p class="text-fg-secondary mt-2">{m.account_erase_what_goes()}</p>
		<!--
			What survives, before the button rather than after it. This is the
			sentence a community will argue about, and it is better argued about here.
		-->
		<p class="text-fg-secondary mt-2">{m.account_erase_what_stays()}</p>

		{#if data.labels.length > 0}
			<p class="text-fg-muted text-meta mt-2">
				{m.account_erase_your_labels()}
				{data.labels.map((label) => `Former member (${label})`).join(' · ')}
			</p>
		{/if}

		{#if form?.error}
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
</main>
