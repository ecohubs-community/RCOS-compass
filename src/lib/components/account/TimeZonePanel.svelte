<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import * as m from '$lib/paraglide/messages';

	/** The zone times are shown to this person in. The `time-display` spec. */
	type Props = {
		data: { timeZone: string | null; timeZones: { region: string; zones: string[] }[] };
		form: { step?: string; error?: string } | null | undefined;
	};

	let { data, form }: Props = $props();

	/** The device's zone, known only once the page runs in a browser. */
	let device = $state<string | null>(null);
	onMount(() => {
		device = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
	});
</script>

<p class="text-fg-secondary">{m.account_time_zone_intro()}</p>
<form method="POST" action="?/setTimeZone" use:enhance class="mt-4 flex flex-wrap items-end gap-3">
	<div class="flex flex-col gap-1">
		<label for="time-zone" class="text-fg font-medium">{m.account_time_zone_label()}</label>
		<select
			id="time-zone"
			name="timeZone"
			required
			class="border-border bg-raised text-fg h-9 rounded-(--radius-control) border px-2"
		>
			{#if !data.timeZone}
				<option value="" selected disabled>{m.account_time_zone_none()}</option>
			{/if}
			{#each data.timeZones as group (group.region)}
				<optgroup label={group.region}>
					{#each group.zones as zone (zone)}
						<option value={zone} selected={zone === data.timeZone}>{zone}</option>
					{/each}
				</optgroup>
			{/each}
		</select>
	</div>
	<button
		type="submit"
		class="border-border text-fg h-9 cursor-pointer rounded-(--radius-control) border px-3 font-medium"
		>{m.account_time_zone_save()}</button
	>
</form>
{#if device && device !== data.timeZone}
	<form method="POST" action="?/setTimeZone" use:enhance class="mt-3">
		<input type="hidden" name="timeZone" value={device} />
		<button type="submit" class="text-accent-fg cursor-pointer underline underline-offset-2"
			>{m.account_time_zone_device({ zone: device })}</button
		>
	</form>
{/if}
{#if form?.step === 'timeZone' && form.error}
	<p role="alert" class="text-attention mt-3">{form.error}</p>
{:else if form?.step === 'timeZone'}
	<p role="status" class="text-fg-secondary mt-3">{m.account_time_zone_saved()}</p>
{/if}
