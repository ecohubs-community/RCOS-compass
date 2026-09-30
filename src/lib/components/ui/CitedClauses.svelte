<script lang="ts">
	import * as m from '$lib/paraglide/messages';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import ClauseRef from './ClauseRef.svelte';
	import { cn } from './cn.js';

	/**
	 * The RCOS text a Path item or a thread answers, as a line of references:
	 * `RCOS §3.6.1 · §3.6.2 · §3.6.4 · related §3.5.4`.
	 *
	 * Owned clauses first — what freezing this answers — then, after the word
	 * "related", the ones the section only leans on. The word is there so the
	 * difference is not carried by colour alone.
	 */
	type Cited = { ref: string; owned: boolean };
	type Props = {
		cites: Cited[];
		hrefFor: (ref: string) => string;
		onopen?: (ref: string, event: MouseEvent) => void;
		selected?: string | null;
		class?: string;
	};

	let { cites, hrefFor, onopen, selected = null, class: className = '' }: Props = $props();

	const owned = $derived(cites.filter((c) => c.owned));
	const related = $derived(cites.filter((c) => !c.owned));
	const click = (ref: string): HTMLAnchorAttributes['onclick'] =>
		onopen ? (event) => onopen(ref, event) : undefined;
</script>

{#if cites.length > 0}
	<span class={cn('inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5', className)}>
		<span class="text-fg-muted">{m.clause_refs_label()}</span>
		{#each owned as cite, index (cite.ref)}
			{#if index > 0}<span class="text-fg-muted" aria-hidden="true">·</span>{/if}
			<ClauseRef
				ref={cite.ref}
				href={hrefFor(cite.ref)}
				onclick={click(cite.ref)}
				selected={selected === cite.ref}
			/>
		{/each}
		{#if related.length > 0}
			{#if owned.length > 0}<span class="text-fg-muted" aria-hidden="true">·</span>{/if}
			<span class="text-fg-muted">{m.clause_refs_related()}</span>
			{#each related as cite, index (cite.ref)}
				{#if index > 0}<span class="text-fg-muted" aria-hidden="true">·</span>{/if}
				<ClauseRef
					ref={cite.ref}
					href={hrefFor(cite.ref)}
					onclick={click(cite.ref)}
					related
					selected={selected === cite.ref}
				/>
			{/each}
		{/if}
	</span>
{/if}
