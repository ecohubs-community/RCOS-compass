<script lang="ts">
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import IconDeviceFloppy from '~icons/tabler/device-floppy';

	let { data, form } = $props();
	const rule = $derived(data.rule);
	const field =
		'border-border bg-raised text-fg min-h-11 w-20 rounded-(--radius-control) border px-3';
</script>

<svelte:head><title>{m.nav_adoption_rule()} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<h1 class="text-page font-medium">{m.adoption_rule_title()}</h1>
	<p class="text-fg-secondary mt-2">{m.adoption_rule_intro()}</p>
	<p class="text-fg-muted text-meta mt-2">{m.adoption_rule_never_enforced()}</p>

	{#if form?.error}
		<p role="alert" class="text-danger mt-4">{form.error}</p>
	{:else if form?.step === 'save'}
		<p role="status" class="text-fg-secondary mt-4">{m.adoption_rule_saved()}</p>
	{/if}

	<!-- `reset: false`, as on the Path settings: the saved values stay in the boxes. -->
	<form
		method="POST"
		action="?/save"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
		class="mt-6 flex flex-col gap-4"
	>
		<fieldset class="border-border bg-surface rounded-(--radius-card) border p-4">
			<legend class="text-fg px-1 font-medium">{m.adoption_rule_quorum()}</legend>
			<p class="text-fg-muted text-meta">{m.adoption_rule_quorum_hint()}</p>
			<div class="mt-3 flex flex-wrap items-center gap-2">
				<label for="quorumNum" class="sr-only">{m.adoption_rule_quorum_num()}</label>
				<input
					id="quorumNum"
					name="quorumNum"
					type="number"
					min="1"
					step="1"
					inputmode="numeric"
					value={rule.quorum?.num ?? ''}
					disabled={!data.can.manage}
					class={field}
					data-tabular
				/>
				<span class="text-fg-secondary">{m.adoption_rule_of_every()}</span>
				<label for="quorumDen" class="sr-only">{m.adoption_rule_quorum_den()}</label>
				<input
					id="quorumDen"
					name="quorumDen"
					type="number"
					min="1"
					step="1"
					inputmode="numeric"
					value={rule.quorum?.den ?? ''}
					disabled={!data.can.manage}
					class={field}
					data-tabular
				/>
				<span class="text-fg-secondary">{m.adoption_rule_members_asked()}</span>
			</div>
		</fieldset>

		<fieldset class="border-border bg-surface rounded-(--radius-card) border p-4">
			<legend class="text-fg px-1 font-medium">{m.adoption_rule_days()}</legend>
			<p class="text-fg-muted text-meta">{m.adoption_rule_days_hint()}</p>
			<div class="mt-3 flex flex-wrap items-center gap-2">
				<label for="minDays" class="sr-only">{m.adoption_rule_days()}</label>
				<input
					id="minDays"
					name="minDays"
					type="number"
					min="0"
					step="1"
					inputmode="numeric"
					value={rule.minDays ?? ''}
					disabled={!data.can.manage}
					class={field}
					data-tabular
				/>
				<span class="text-fg-secondary">{m.adoption_rule_days_unit()}</span>
			</div>
		</fieldset>

		{#if data.can.manage}
			<button
				type="submit"
				class="bg-accent-solid hover:bg-accent-solid-hover inline-flex min-h-11 cursor-pointer items-center gap-2 self-start rounded-(--radius-control) px-3 font-medium text-white"
				><IconDeviceFloppy
					class="h-4 w-4 flex-none"
					aria-hidden="true"
				/>{m.adoption_rule_save()}</button
			>
		{:else}
			<p class="text-fg-muted text-meta">{m.adoption_rule_steward_only()}</p>
		{/if}
	</form>
</main>
