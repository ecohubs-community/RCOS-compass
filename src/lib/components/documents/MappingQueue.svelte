<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Button from '$lib/components/ui/Button.svelte';
	import * as m from '$lib/paraglide/messages';
	import IconCheck from '~icons/tabler/check';
	import ClausePicker, { type ClauseOption } from './ClausePicker.svelte';
	import HandMapCard from './HandMapCard.svelte';
	import PaperView, { type Excerpt, type Paper } from './PaperView.svelte';
	import ReconfirmBlock from './ReconfirmBlock.svelte';
	import RequirementTip, { type Requirement } from './RequirementTip.svelte';
	import type { Card } from './SuggestionCard.svelte';
	import { currentSuggestion } from './queue.js';

	/**
	 * Mapping below 1024 pixels: one open suggestion at a time, in two steps.
	 * Design 16b; the change's `mapping-workspace` spec.
	 *
	 * The same data as the two panes, and every act the panes offer: the scan
	 * block sits above (passed in as `scan`), the requirement is behind the same
	 * `?`, "see it in the page" opens the text view where a paragraph can be mapped
	 * by hand, and the finished state carries *Mark mapping as done*, the
	 * re-confirm block and *Turn into definition* — nothing is desktop-only.
	 *
	 * The step and the passage are in the URL. Answering moves on to the first
	 * open suggestion at step one; a passage with two open suggestions comes up
	 * once for each, because answering one leaves the other open.
	 */
	type Props = {
		filename: string;
		paged: boolean;
		cards: readonly Card[];
		counts: { identified: number; open: number };
		requirements: Record<string, Requirement>;
		requirementHref: (ref: string) => string;
		clauses: readonly ClauseOption[];
		can: { map: boolean; draft: boolean };
		/** `?passage=` */
		passage: string | null;
		step: 'read' | 'confirm';
		/** `?view=page`: the text view, at `passage`. */
		seePage: boolean;
		paper: Paper;
		reconfirm: {
			evidenceId: string;
			passageId: string;
			clauseRef: string;
			quote: string;
			confirmer: string | null;
			confirmedAt: number | null;
		}[];
		canMarkDone: boolean;
		scan: import('svelte').Snippet;
		excerpt: Excerpt | null;
		onexcerpt: (excerpt: Excerpt) => void;
	};

	let {
		filename,
		paged,
		cards,
		counts,
		requirements,
		requirementHref,
		clauses,
		can,
		passage,
		step,
		seePage,
		paper,
		reconfirm,
		canMarkDone,
		scan,
		excerpt,
		onexcerpt
	}: Props = $props();

	const current = $derived(currentSuggestion(cards, passage));
	const done = $derived(counts.identified - counts.open);
	const percent = $derived(
		counts.identified === 0 ? 0 : Math.round((done / counts.identified) * 100)
	);
	const requirement = $derived(current ? (requirements[current.clauseKey] ?? null) : null);
	const confirmed = $derived(cards.filter((card) => card.state === 'confirmed'));

	const at = (params: Record<string, string>) => `?${new URLSearchParams(params)}`;
	const readHref = (id: string) => at({ passage: id, step: 'read' });
	const confirmHref = (id: string) => at({ passage: id, step: 'confirm' });
	const pageHref = (id: string) => at({ view: 'page', passage: id });
	/** After an answer: the first open suggestion, at step one. */
	const NEXT = 'step=read';

	/** With JavaScript, an answer moves on the way the no-JS redirect does. */
	const advance: SubmitFunction =
		() =>
		async ({ result, update }) => {
			if (result.type === 'success') {
				// eslint-disable-next-line svelte/no-navigation-without-resolve -- same page, query only
				await goto(`?${NEXT}`, { replaceState: true, noScroll: true, invalidateAll: true });
			} else {
				await update();
			}
		};

	let tipOpen = $state(false);

	const selectedParagraph = $derived(
		seePage ? paper.passages.find((row) => row.id === passage && row.kind === 'paragraph') : null
	);
	const selectedHasClaims = $derived(cards.some((card) => card.passageId === passage));
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	Every href below is a query on this same page (`?passage=`, `?page=`, `?step=`),
	built by a local helper; `resolve` is for route ids, and there is none here.
-->

<div class="flex flex-col gap-4 px-4 py-4 sm:px-6">
	<header class="flex flex-col gap-2">
		<div class="flex items-baseline gap-3">
			<p class="text-fg min-w-0 flex-1 truncate font-medium">{filename}</p>
			<p class="text-fg-secondary text-meta flex-none" data-tabular>
				{m.queue_done({ done, total: counts.identified })}
			</p>
		</div>
		<div
			class="bg-border h-1 overflow-hidden rounded-full"
			role="progressbar"
			aria-label={m.queue_done({ done, total: counts.identified })}
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={percent}
		>
			<!-- style= exception 1 (docs/02 §5): a computed bar width. -->
			<div class="bg-accent h-full" style="width: {percent}%"></div>
		</div>
		{@render scan()}
	</header>

	{#if seePage}
		<a href={passage ? readHref(passage) : `?${NEXT}`} class="text-accent-fg text-meta"
			>{m.queue_back()}</a
		>
		<div
			class="border-border flex h-[70vh] flex-col overflow-hidden rounded-(--radius-card) border"
		>
			<PaperView
				{paper}
				selected={passage}
				{filename}
				anchorPrefix="queue-passage-"
				passageHref={pageHref}
				pageHref={(page) => at({ view: 'page', page: String(page) })}
				onselect={(_id, href) =>
					goto(href, { replaceState: true, noScroll: true, keepFocus: true })}
				{onexcerpt}
			/>
		</div>
		{#if selectedParagraph && !selectedHasClaims && can.map}
			<HandMapCard
				passageId={selectedParagraph.id}
				number={selectedParagraph.number ?? 0}
				excerpt={excerpt?.passageId === selectedParagraph.id ? excerpt : null}
				{clauses}
				returnTo={new URLSearchParams({ view: 'page', passage: selectedParagraph.id }).toString()}
			/>
		{/if}
	{:else if current}
		<nav aria-label={m.queue_steps_label()} class="flex items-center gap-4">
			<a
				href={readHref(current.passageId)}
				class="text-meta inline-flex min-h-11 items-center gap-2 {step === 'read'
					? 'text-fg'
					: 'text-fg-muted'}"
				aria-current={step === 'read' ? 'step' : undefined}
			>
				<span
					class="bg-raised inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
					aria-hidden="true"
					>{#if step === 'confirm'}<IconCheck class="h-3 w-3" />{:else}1{/if}</span
				>{m.queue_step_read()}
			</a>
			<a
				href={confirmHref(current.passageId)}
				class="text-meta inline-flex min-h-11 items-center {step === 'confirm'
					? 'text-fg'
					: 'text-fg-muted'}"
				aria-current={step === 'confirm' ? 'step' : undefined}>{m.queue_step_confirm()}</a
			>
		</nav>

		{#if step === 'read'}
			<section class="flex flex-col gap-2" aria-labelledby="queue-passage">
				<h2 id="queue-passage" class="text-fg-muted text-meta" data-tabular>
					{m.queue_passage({ n: done + 1, total: counts.identified })}
				</h2>
				<div class="bg-paper text-paper-ink rounded-[3px] px-5 py-4">
					<p class="font-(family-name:--font-serif) text-[16px] leading-[1.7]">{current.quote}</p>
				</div>
				<p class="text-fg-muted text-meta" data-tabular>
					{paged
						? m.queue_where_paged({ page: current.page, number: current.number })
						: m.queue_where({ number: current.number })}
					·
					<a href={pageHref(current.passageId)} class="text-accent-fg underline underline-offset-2"
						>{m.queue_see()}</a
					>
				</p>
				<a
					href={confirmHref(current.passageId)}
					class="bg-accent-solid hover:bg-accent-solid-hover mt-2 inline-flex min-h-11 items-center justify-center rounded-(--radius-control) px-4 font-medium text-white"
					>{m.queue_next()}</a
				>
			</section>
		{:else}
			<section class="flex flex-col gap-3" aria-labelledby="queue-suggested">
				<div class="border-border bg-surface rounded-(--radius-card) border px-4 py-3.5">
					<h2 id="queue-suggested" class="text-fg-muted text-meta">{m.queue_suggested()}</h2>
					<div class="mt-1.5 flex items-center gap-2">
						<span class="text-fg font-mono text-[13px]"
							>{requirement ? `${requirement.standard} · ` : ''}§{current.clauseRef}</span
						>
						{#if requirement}
							<button
								type="button"
								class="text-fg-secondary border-border-strong inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[12px]"
								aria-label={m.workspace_requirement_show({ ref: current.clauseRef })}
								aria-expanded={tipOpen}
								aria-controls="queue-requirement"
								onclick={() => (tipOpen = !tipOpen)}
								><span
									class="border-border-strong inline-flex h-5 w-5 items-center justify-center rounded-full border"
									>?</span
								></button
							>
						{/if}
					</div>
					<p class="text-fg">{current.clauseTitle}</p>
					{#if requirement}
						<div class={tipOpen ? 'mt-3' : ''}>
							<RequirementTip
								id="queue-requirement"
								{requirement}
								href={requirementHref(requirement.ref)}
								bind:open={tipOpen}
							/>
						</div>
					{/if}
					{#if current.reason}
						<p class="text-fg-secondary text-meta mt-2.5">{current.reason}</p>
					{/if}
				</div>
				<p class="text-fg-muted text-meta">{m.queue_not_adopt()}</p>

				{#if can.map}
					<div class="flex flex-col gap-2">
						<form method="POST" action="?{NEXT}&/confirm" use:enhance={advance}>
							<input type="hidden" name="evidenceId" value={current.evidenceId} />
							<Button type="submit" variant="primary" class="min-h-11 w-full"
								>{m.queue_confirm({ ref: current.clauseRef })}</Button
							>
						</form>
						<details>
							<summary
								class="border-border-strong text-fg hover:bg-raised flex min-h-11 cursor-pointer list-none items-center justify-center rounded-(--radius-control) border font-medium"
								>{m.queue_change()}</summary
							>
							<form
								method="POST"
								action="?{NEXT}&/changeClause"
								class="mt-2 flex flex-col gap-2"
								use:enhance={advance}
							>
								<input type="hidden" name="evidenceId" value={current.evidenceId} />
								<ClausePicker id="queue-change-{current.evidenceId}" options={clauses} />
								<Button type="submit" class="min-h-11">{m.workspace_card_change_submit()}</Button>
							</form>
						</details>
						<form method="POST" action="?{NEXT}&/dismissPassage" use:enhance={advance}>
							<input type="hidden" name="passageId" value={current.passageId} />
							<Button type="submit" variant="ghost" class="min-h-11 w-full"
								>{m.workspace_card_not_governance()}</Button
							>
						</form>
					</div>
				{/if}
			</section>
		{/if}
	{:else}
		<section class="flex flex-col gap-3" aria-labelledby="queue-finished">
			<h2 id="queue-finished" class="text-fg">
				{counts.identified > 0 ? m.workspace_all_answered() : m.workspace_no_cards()}
			</h2>
			{#if canMarkDone}
				<form method="POST" action="?/markDone" use:enhance>
					<Button type="submit" variant="primary" class="min-h-11 w-full"
						>{m.workspace_mark_done()}</Button
					>
				</form>
			{/if}
			<p class="text-fg-muted text-meta">
				{m.queue_hand_hint()}
				<a href={at({ view: 'page' })} class="text-accent-fg underline underline-offset-2"
					>{m.queue_see()}</a
				>
			</p>
		</section>
	{/if}

	{#if !seePage}
		<ReconfirmBlock candidates={reconfirm} canMap={can.map} returnTo={NEXT} />

		{#if !current && confirmed.length > 0}
			<section class="flex flex-col gap-2" aria-labelledby="queue-confirmed">
				<h2 id="queue-confirmed" class="text-fg-muted text-meta">{m.queue_confirmed_heading()}</h2>
				<ul class="flex flex-col gap-2">
					{#each confirmed as card (card.evidenceId)}
						<li
							class="border-accent/40 bg-accent-subtle flex flex-col gap-1.5 rounded-(--radius-card) border px-4 py-3"
						>
							<p class="text-fg-secondary font-(family-name:--font-serif) text-[14px]">
								{card.quote}
							</p>
							<div class="flex flex-wrap items-center gap-2">
								<span class="text-fg font-mono text-[12px]">§{card.clauseRef}</span>
								<span class="text-fg-secondary text-meta">{card.clauseTitle}</span>
								{#if card.definable && can.draft}
									<form method="POST" action="?/draft" class="ml-auto" use:enhance>
										<input type="hidden" name="evidenceId" value={card.evidenceId} />
										<button
											type="submit"
											class="text-accent-fg text-meta inline-flex min-h-11 cursor-pointer items-center"
											>{m.workspace_card_to_definition()}</button
										>
									</form>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
