<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { enhance } from '$app/forms';
	import * as m from '$lib/paraglide/messages';
	import IconWand from '~icons/tabler/wand';

	/**
	 * What stands where the annotated text would be, before the linter has run.
	 * Design: screen 03b.
	 *
	 * A separate state with its own sentence, rather than an empty panel. The
	 * linter splits a body into lines and judges each against its own job, so
	 * until it has run there is nothing to split by — and a blank panel would read
	 * as "nothing wrong here", which is the one thing a check nobody performed
	 * must never say.
	 */
	let {
		action = '?/run',
		canRun = true,
		stale = false
	}: { action?: string; canRun?: boolean; stale?: boolean } = $props();
</script>

<div
	class="border-border flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-dashed p-4"
>
	<div class="min-w-56 flex-1">
		<p class="text-fg font-medium">
			{stale ? m.linter_not_run_stale() : m.linter_not_run_title()}
		</p>
		<p class="text-fg-secondary text-meta mt-1">{m.linter_not_run_why()}</p>
	</div>
	{#if canRun}
		<form method="POST" {action} use:enhance>
			<Button type="submit" variant="primary" icon={IconWand}>{m.linter_not_run_action()}</Button>
		</form>
	{/if}
</div>
<p class="text-fg-muted text-meta mt-2">{m.linter_not_run_after()}</p>
