<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import ClausePicker, { type ClauseOption } from './ClausePicker.svelte';

	/**
	 * Mapping a paragraph nobody has claimed yet, by hand. Offered when a member
	 * selects such a paragraph in the document, at every width.
	 *
	 * Words selected inside the paragraph (with JavaScript) become the excerpt;
	 * without a selection, or without JavaScript, the whole paragraph is mapped.
	 */
	type Props = {
		passageId: string;
		number: number;
		excerpt: { start: number; end: number; text: string } | null;
		clauses: readonly ClauseOption[];
		returnTo: string;
		error?: string | null;
	};

	let { passageId, number, excerpt, clauses, returnTo, error = null }: Props = $props();
	const action = $derived(`?${returnTo ? `${returnTo}&` : ''}/map`);
</script>

<section
	class="border-border-strong bg-surface rounded-(--radius-card) border border-dashed px-4 py-3.5"
	aria-labelledby="hand-{passageId}"
>
	<h2 id="hand-{passageId}" class="text-fg font-medium">{m.workspace_hand_heading({ number })}</h2>
	<p class="text-fg-muted text-meta mt-1">
		{excerpt ? m.workspace_hand_excerpt({ excerpt: excerpt.text }) : m.workspace_hand_whole()}
	</p>
	<form method="POST" {action} class="mt-3 flex flex-wrap items-end gap-2" use:enhance>
		<input type="hidden" name="passageId" value={passageId} />
		{#if excerpt}
			<input type="hidden" name="excerptStart" value={excerpt.start} />
			<input type="hidden" name="excerptEnd" value={excerpt.end} />
		{/if}
		<div class="min-w-56 flex-1">
			<ClausePicker id="hand-clause-{passageId}" options={clauses} />
		</div>
		<Button type="submit" variant="primary" class="mb-5">{m.workspace_hand_submit()}</Button>
	</form>
	{#if error}
		<p role="alert" class="text-danger text-meta">{error}</p>
	{/if}
</section>
