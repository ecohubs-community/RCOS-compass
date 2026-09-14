<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import IconSparkles from '~icons/tabler/sparkles';

	/**
	 * Starting, following and continuing a scan. The same block heads the rail and
	 * the phone queue, so a member on a phone can do everything a desktop can.
	 *
	 * The estimate, the progress and the refusal come from one server function,
	 * `scanAvailability`: the button is never enabled for a scan the service would
	 * refuse, and a disabled button always says why.
	 */
	type Availability =
		{ ok: true; paragraphs: number; alreadyRead: number } | { ok: false; reason: string | null };

	type Props = {
		live: boolean;
		/** Null: this member cannot run AI, so nothing is offered. */
		availability: Availability | null;
		progress: { read: number; total: number };
		/** Why the last scan stopped, when it did. */
		detail: string | null;
		/** Where the form posts back to, without the leading `?`. */
		returnTo: string;
		canMapByHand: boolean;
	};

	let { live, availability, progress, detail, returnTo, canMapByHand }: Props = $props();

	const action = $derived(`?${returnTo ? `${returnTo}&` : ''}/startScan`);
	const left = $derived(availability?.ok ? availability.paragraphs - availability.alreadyRead : 0);
	const percent = $derived(
		progress.total === 0 ? 0 : Math.round((progress.read / progress.total) * 100)
	);
</script>

{#if live}
	<div class="flex flex-col gap-1.5" role="status">
		<p class="text-fg-secondary text-meta" data-tabular>
			{m.library_progress_scanning({ read: progress.read, total: progress.total })}
		</p>
		<div
			class="bg-border h-[3px] overflow-hidden rounded-full"
			role="progressbar"
			aria-label={m.library_state_scanning()}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={percent}
		>
			<!-- style= exception 1 (docs/02 §5): a computed bar width. -->
			<div class="bg-info h-full" style="width: {percent}%"></div>
		</div>
	</div>
{:else if availability?.ok && left > 0}
	<form method="POST" {action} class="flex flex-wrap items-center gap-x-3 gap-y-1.5" use:enhance>
		<Button type="submit" variant="primary" icon={IconSparkles}>
			{availability.alreadyRead === 0
				? m.library_action_start()
				: m.workspace_scan_continue({ count: left })}
		</Button>
		{#if availability.alreadyRead === 0}
			<span class="text-fg-muted text-meta">{m.workspace_scan_estimate({ count: left })}</span>
		{/if}
	</form>
	{#if detail}
		<p class="text-fg-secondary text-meta mt-1.5">{detail}</p>
	{/if}
{:else if availability && !availability.ok && availability.reason}
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
		<Button disabled variant="primary" icon={IconSparkles} aria-describedby="scan-refusal"
			>{m.library_action_start()}</Button
		>
		<p id="scan-refusal" class="text-fg-secondary text-meta">{availability.reason}</p>
	</div>
{/if}
{#if canMapByHand && !live}
	<p class="text-fg-muted text-meta mt-1.5">{m.workspace_by_hand_hint()}</p>
{/if}
