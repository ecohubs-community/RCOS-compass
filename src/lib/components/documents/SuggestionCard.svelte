<script lang="ts" module>
	export type Card = {
		evidenceId: string;
		passageId: string;
		page: number;
		number: number;
		quote: string;
		state: 'suggested' | 'confirmed' | 'dismissed';
		clauseKey: string;
		clauseRef: string;
		clauseTitle: string;
		reason: string | null;
		suggestedBy: 'ai' | 'human';
		excerpt: { start: number; end: number } | null;
		confirmer: string | null;
		confirmedAt: number | null;
		definable: boolean;
	};
</script>

<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import IconArrowRight from '~icons/tabler/arrow-right';
	import IconCircleCheck from '~icons/tabler/circle-check';
	import ClausePicker, { type ClauseOption } from './ClausePicker.svelte';
	import RequirementTip, { type Requirement } from './RequirementTip.svelte';
	import { shortDate } from './format.js';

	/**
	 * One claim about one passage. Design 05's card; the change's
	 * `mapping-workspace` spec.
	 *
	 * A reason, never a strength: the model's confidence is stored and not sent
	 * here. Every act is a form that works without JavaScript and posts back to
	 * the same passage (`returnTo` carries the query string), so a member is
	 * never dropped at the top of the list after answering one card.
	 */
	/** What the card draws; the queue reads the rest of `Card`. */
	type Props = {
		card: Omit<Card, 'clauseKey' | 'suggestedBy' | 'excerpt'>;
		filename: string;
		paged: boolean;
		selected: boolean;
		requirement: Requirement | null;
		requirementHref: string;
		clauses: readonly ClauseOption[];
		can: { map: boolean; draft: boolean };
		passageHref: string;
		/** The query the forms post back to — `passage=…&page=…`, without the leading `?`. */
		returnTo: string;
		onselect?: (href: string) => void;
	};

	let {
		card,
		filename,
		paged,
		selected,
		requirement,
		requirementHref,
		clauses,
		can,
		passageHref,
		returnTo,
		onselect
	}: Props = $props();

	let tipOpen = $state(false);
	const action = (name: string) => `?${returnTo ? `${returnTo}&` : ''}/${name}`;
	const tipId = $derived(`requirement-${card.evidenceId}`);

	const where = $derived(
		paged
			? m.workspace_card_where_paged({ filename, page: card.page, number: card.number })
			: m.workspace_card_where({ filename, number: card.number })
	);
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	Every href below is a query on this same page (`?passage=`, `?page=`, `?step=`),
	built by a local helper; `resolve` is for route ids, and there is none here.
-->

<article
	id="card-{card.evidenceId}"
	data-passage-card={card.passageId}
	class="rounded-(--radius-card) border px-4 py-3.5 {card.state === 'confirmed'
		? 'border-accent/40 bg-accent-subtle'
		: card.state === 'dismissed'
			? 'border-border bg-bg'
			: 'border-border bg-surface'} {selected
		? 'outline-accent-fg outline-2 outline-offset-2'
		: ''}"
	aria-current={selected ? 'true' : undefined}
>
	<div class="flex flex-wrap items-start gap-x-3.5 gap-y-2">
		<a
			href={passageHref}
			class="group min-w-48 flex-1"
			aria-label={m.workspace_card_show({ number: card.number })}
			onclick={(event) => {
				if (!onselect || event.metaKey || event.ctrlKey || event.shiftKey) return;
				event.preventDefault();
				onselect(passageHref);
			}}
		>
			<span
				class="group-hover:text-fg block font-(family-name:--font-serif) text-[14px] leading-normal {card.state ===
				'dismissed'
					? 'text-fg-muted line-through decoration-1'
					: 'text-fg-secondary'}">{card.quote}</span
			>
			<span class="text-fg-muted text-meta mt-1.5 block" data-tabular>{where}</span>
		</a>
		<IconArrowRight
			class="text-fg-muted mt-1 hidden h-4 w-4 flex-none sm:block"
			aria-hidden="true"
		/>
		<div class="w-full sm:w-49 sm:flex-none">
			<div class="flex items-center gap-2">
				<span class="text-fg font-mono text-[12px]">§{card.clauseRef}</span>
				{#if requirement}
					<button
						type="button"
						class="text-fg-secondary hover:text-fg border-border-strong inline-flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border text-[10px]"
						aria-label={m.workspace_requirement_show({ ref: card.clauseRef })}
						aria-expanded={tipOpen}
						aria-controls={tipId}
						onclick={() => (tipOpen = !tipOpen)}>?</button
					>
				{/if}
			</div>
			<p class="text-fg-secondary text-meta mt-1">{card.clauseTitle}</p>
		</div>
	</div>

	{#if card.reason}
		<!-- The model's sentence, as text: no markdown, no links. -->
		<p class="text-fg-secondary text-meta mt-2.5">{card.reason}</p>
	{/if}

	{#if requirement}
		<div class={tipOpen ? 'mt-3' : ''}>
			<RequirementTip id={tipId} {requirement} href={requirementHref} bind:open={tipOpen} />
		</div>
	{/if}

	{#if card.state === 'suggested' && can.map}
		<div class="border-border mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
			<form method="POST" action={action('confirm')} use:enhance>
				<input type="hidden" name="evidenceId" value={card.evidenceId} />
				<Button type="submit" variant="primary" size="sm">{m.workspace_card_confirm()}</Button>
			</form>
			<form method="POST" action={action('dismiss')} use:enhance>
				<input type="hidden" name="evidenceId" value={card.evidenceId} />
				<Button type="submit" variant="ghost" size="sm">{m.workspace_card_dismiss()}</Button>
			</form>
			<form method="POST" action={action('dismissPassage')} use:enhance>
				<input type="hidden" name="passageId" value={card.passageId} />
				<Button type="submit" variant="ghost" size="sm">{m.workspace_card_not_governance()}</Button>
			</form>
			<details class="w-full">
				<summary
					class="text-fg border-border-strong hover:bg-raised text-meta inline-flex h-7 cursor-pointer list-none items-center rounded-(--radius-control) border px-2.5 font-medium"
					>{m.workspace_card_change()}</summary
				>
				<form
					method="POST"
					action={action('changeClause')}
					class="mt-2.5 flex flex-wrap items-end gap-2"
					use:enhance
				>
					<input type="hidden" name="evidenceId" value={card.evidenceId} />
					<div class="min-w-56 flex-1">
						<ClausePicker id="change-{card.evidenceId}" options={clauses} />
					</div>
					<Button type="submit" size="sm" class="mb-5">{m.workspace_card_change_submit()}</Button>
				</form>
			</details>
		</div>
	{:else if card.state === 'confirmed'}
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<IconCircleCheck class="text-accent-fg h-3.5 w-3.5" aria-hidden="true" />
			<span class="text-fg-secondary text-meta">
				{card.confirmer && card.confirmedAt
					? m.workspace_card_mapped_by({
							person: card.confirmer,
							date: shortDate(card.confirmedAt)
						})
					: m.workspace_card_mapped_on({
							date: card.confirmedAt ? shortDate(card.confirmedAt) : ''
						})}
			</span>
			{#if card.definable && can.draft}
				<form method="POST" action={action('draft')} class="ml-auto" use:enhance>
					<input type="hidden" name="evidenceId" value={card.evidenceId} />
					<button type="submit" class="text-accent-fg text-meta cursor-pointer hover:underline"
						>{m.workspace_card_to_definition()}</button
					>
				</form>
			{/if}
		</div>
	{:else if card.state === 'dismissed'}
		<p class="text-fg-muted text-meta mt-2.5">{m.workspace_card_dismissed()}</p>
	{/if}
</article>
