<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import Button from '$lib/components/ui/Button.svelte';
	import { links } from '$lib/links';
	import * as m from '$lib/paraglide/messages';
	import { weekdayName } from '$lib/time/format';
	import IconDeviceFloppy from '~icons/tabler/device-floppy';

	let { data, form } = $props();
	const locale = $derived((page.data.locale as string | undefined) ?? 'en');
	// Monday first, the way a week is read in the three interface languages.
	const DAYS = [1, 2, 3, 4, 5, 6, 0];
</script>

<svelte:head><title>{m.notification_settings_title()} · {data.community.name}</title></svelte:head>

<main class="mx-auto w-full max-w-3xl px-6 py-8">
	<p class="text-meta">
		<a
			href={links.notifications(data.community.slug)}
			class="text-accent underline underline-offset-2">← {m.notifications_heading()}</a
		>
	</p>
	<h1 class="text-page mt-2 font-medium">{m.notification_settings_heading()}</h1>
	<p class="text-fg-secondary mt-2">
		{m.notification_settings_intro({ community: data.community.name })}
	</p>

	{#if form?.step === 'preferences' && 'error' in form}
		<p role="alert" class="text-attention mt-4">{form.error}</p>
	{:else if form?.step === 'preferences'}
		<p role="status" class="text-fg-secondary mt-4">{m.notification_settings_saved()}</p>
	{/if}

	<form
		method="POST"
		use:enhance={() =>
			async ({ update }) =>
				update({ reset: false })}
		class="mt-6 flex flex-col gap-6"
	>
		<div class="flex items-start gap-3">
			<input
				id="email-enabled"
				name="emailEnabled"
				type="checkbox"
				checked={data.preferences.emailEnabled}
				class="mt-1 h-4 w-4"
			/>
			<label for="email-enabled" class="flex flex-col gap-0.5">
				<span class="text-fg font-medium">{m.notification_settings_email_label()}</span>
				<span class="text-fg-secondary text-meta">{m.notification_settings_email_hint()}</span>
			</label>
		</div>

		<div class="flex flex-col gap-1">
			<label for="digest-day" class="text-fg font-medium"
				>{m.notification_settings_day_label()}</label
			>
			<select
				id="digest-day"
				name="digestDay"
				aria-describedby="digest-day-hint"
				class="border-border bg-raised text-fg h-9 w-fit rounded-(--radius-control) border px-3"
			>
				{#each DAYS as day (day)}
					<option value={day} selected={day === data.preferences.digestDay}
						>{weekdayName(day, locale)}</option
					>
				{/each}
			</select>
			<p id="digest-day-hint" class="text-fg-secondary text-meta">
				{m.notification_settings_day_hint({ zone: data.digestZone })}
				<a
					href={links.timeZoneSettings(data.community.slug)}
					class="text-accent underline underline-offset-2">{m.notification_settings_zone_link()}</a
				>
			</p>
		</div>

		<Button type="submit" icon={IconDeviceFloppy} class="self-start">
			{m.notification_settings_save()}
		</Button>
	</form>

	<p class="text-fg-muted text-meta mt-8">{m.notification_settings_in_app()}</p>
</main>
