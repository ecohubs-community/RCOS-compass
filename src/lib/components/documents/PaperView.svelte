<script lang="ts" module>
	import type { InlineNode } from '$lib/shared/markdown';

	/** The shapes `$lib/server/documents/paper.ts` builds; mirrored, as components may not import the server. */
	export type PaperPassage = {
		id: string;
		page: number;
		kind: 'heading' | 'paragraph';
		number: number | null;
		highlight: 'none' | 'open' | 'confirmed';
		segments: { marked: boolean; nodes: InlineNode[] }[];
		text: string;
	};

	export type Paper = {
		paged: boolean;
		page: number | null;
		pageCount: number;
		outline: { id: string; text: string }[];
		passages: PaperPassage[];
	};

	export type Excerpt = { passageId: string; start: number; end: number; text: string };

	/**
	 * Open and confirmed differ by the underline's style as well as the tint, so
	 * the difference survives without colour.
	 */
	const MARK: Record<PaperPassage['highlight'], string> = {
		none: '',
		open: 'bg-attention/20 text-paper-ink underline decoration-attention decoration-dashed decoration-1 underline-offset-4',
		confirmed:
			'bg-accent/25 text-paper-ink underline decoration-accent-deep decoration-solid decoration-2 underline-offset-4'
	};
</script>

<script lang="ts">
	import InlineText from '$lib/components/ui/InlineText.svelte';
	import * as m from '$lib/paraglide/messages';

	/**
	 * A document, read as text on a sheet of paper. Design 05's document pane; the
	 * change's `document-viewer` spec.
	 *
	 * Server-rendered and complete without JavaScript: every passage and page is a
	 * link carrying `?passage=` or `?page=`. With JavaScript the parent handles a
	 * selection without a full navigation, and selecting words inside a paragraph
	 * reports them as an excerpt for mapping by hand.
	 */
	type Props = {
		paper: Paper;
		selected: string | null;
		filename: string;
		/** A link that selects a passage — `?passage=`, plus whatever else the screen keeps. */
		passageHref: (passageId: string) => string;
		pageHref: (page: number) => string;
		/** Anchors are `{prefix}{id}`; the queue uses its own so two views never share an id. */
		anchorPrefix?: string;
		onselect?: (passageId: string, href: string) => void;
		onexcerpt?: (excerpt: Excerpt) => void;
	};

	let {
		paper,
		selected,
		filename,
		passageHref,
		pageHref,
		anchorPrefix = 'passage-',
		onselect,
		onexcerpt
	}: Props = $props();

	let sheet = $state<HTMLElement | null>(null);

	function follow(event: MouseEvent, passageId: string) {
		if (!onselect || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
		event.preventDefault();
		onselect(passageId, passageHref(passageId));
	}

	/**
	 * Words selected inside one paragraph become the excerpt. The offsets are
	 * found in the passage's source text, so what the server stores is what the
	 * document says, whatever the rendering did with it.
	 */
	function selectWords() {
		if (!onexcerpt || !sheet) return;
		const selection = window.getSelection();
		if (!selection || selection.isCollapsed) return;
		const holder = (node: Node | null) =>
			(node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>(
				'[data-passage]'
			);
		const from = holder(selection.anchorNode);
		if (!from || from !== holder(selection.focusNode) || !sheet.contains(from)) return;
		const passage = paper.passages.find((row) => row.id === from.dataset.passage);
		const words = selection.toString().replace(/\s+/g, ' ').trim();
		if (!passage || passage.kind !== 'paragraph' || words === '') return;
		// Whitespace in the selection and in the source may differ (a line break
		// rendered as a space), so the words are matched with any run of it between.
		const pattern = new RegExp(
			words
				.split(' ')
				.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
				.join('\\s+')
		);
		const found = pattern.exec(passage.text);
		if (!found) return;
		onexcerpt({
			passageId: passage.id,
			start: found.index,
			end: found.index + found[0].length,
			text: words
		});
	}

	function clickParagraph(event: MouseEvent, passageId: string) {
		const selection = window.getSelection();
		if (selection && !selection.isCollapsed) return;
		if ((event.target as Element).closest('a')) return;
		if (onselect) onselect(passageId, passageHref(passageId));
	}

	$effect(() => {
		if (!selected || !sheet) return;
		const target = sheet.querySelector<HTMLElement>(`[data-passage="${CSS.escape(selected)}"]`);
		target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	Every href below is a query on this same page (`?passage=`, `?page=`, `?step=`),
	built by a local helper; `resolve` is for route ids, and there is none here.
-->

<div class="flex min-h-0 flex-1 flex-col">
	{#if paper.paged && paper.page !== null}
		<nav
			class="border-border flex flex-none items-center gap-2 border-b px-3.5 py-2"
			aria-label={m.workspace_pages_label()}
		>
			<span class="text-fg text-meta min-w-0 flex-1 truncate">{filename}</span>
			{#if paper.page > 1}
				<a
					href={pageHref(paper.page - 1)}
					class="border-border text-fg-secondary hover:text-fg text-meta rounded-(--radius-control) border px-2 py-1"
					aria-label={m.workspace_page_prev({ page: paper.page - 1 })}>‹</a
				>
			{/if}
			<span class="text-fg-secondary text-meta" data-tabular aria-current="page">
				{m.workspace_page_of({ page: paper.page, count: paper.pageCount })}
			</span>
			{#if paper.page < paper.pageCount}
				<a
					href={pageHref(paper.page + 1)}
					class="border-border text-fg-secondary hover:text-fg text-meta rounded-(--radius-control) border px-2 py-1"
					aria-label={m.workspace_page_next({ page: paper.page + 1 })}>›</a
				>
			{/if}
		</nav>
	{/if}

	<div class="flex min-h-0 flex-1">
		{#if paper.outline.length > 0}
			<nav
				class="border-border hidden w-44 flex-none overflow-y-auto border-r px-3 py-3 xl:block"
				aria-label={m.workspace_outline()}
			>
				<p class="text-fg-muted text-meta">{m.workspace_outline()}</p>
				<ol class="mt-2 flex flex-col gap-1.5">
					{#each paper.outline as heading (heading.id)}
						<li>
							<a
								href="#{anchorPrefix}{heading.id}"
								class="text-fg-secondary hover:text-fg text-meta line-clamp-2">{heading.text}</a
							>
						</li>
					{/each}
				</ol>
			</nav>
		{/if}

		<div class="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
			<!-- A mouseup, not a click: selecting words is a drag, and it ends where the mouse lifts. -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<article
				bind:this={sheet}
				class="bg-paper text-paper-ink mx-auto max-w-[36rem] rounded-[2px] px-5 py-7 font-(family-name:--font-serif) text-[15px] leading-[1.8] sm:px-10 sm:py-8"
				aria-label={m.workspace_document_label()}
				onmouseup={selectWords}
				onkeyup={selectWords}
			>
				{#each paper.passages as passage (passage.id)}
					{#if passage.kind === 'heading'}
						<h2
							id="{anchorPrefix}{passage.id}"
							data-passage={passage.id}
							class="text-paper-muted mt-6 mb-4 text-center text-[13px] tracking-[0.12em] uppercase first:mt-0"
						>
							{passage.text}
						</h2>
					{:else}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
						<!-- The ¶ link is the keyboard's way in; the click on the words is a convenience on top of it. -->
						<p
							id="{anchorPrefix}{passage.id}"
							data-passage={passage.id}
							class="relative mb-3 scroll-mt-4 rounded-[3px] pl-9 {selected === passage.id
								? 'outline-accent-deep outline-2 outline-offset-2'
								: ''}"
							onclick={(event) => clickParagraph(event, passage.id)}
						>
							<a
								href={passageHref(passage.id)}
								class="text-paper-muted hover:text-paper-ink absolute top-0 left-0 font-sans text-[12px] no-underline"
								aria-label={m.workspace_select_paragraph({ number: passage.number ?? 0 })}
								aria-current={selected === passage.id ? 'true' : undefined}
								onclick={(event) => follow(event, passage.id)}
								data-tabular>¶{passage.number}</a
							>
							{#each passage.segments as segment, index (index)}
								{#if segment.marked && passage.highlight !== 'none'}
									<mark class={MARK[passage.highlight]}><InlineText nodes={segment.nodes} /></mark>
								{:else}
									<InlineText nodes={segment.nodes} />
								{/if}
							{/each}
						</p>
					{/if}
				{/each}
				{#if paper.paged && paper.page !== null}
					<p class="text-paper-muted mt-6 text-center font-sans text-[11px]" data-tabular>
						— {paper.page} —
					</p>
				{/if}
			</article>
		</div>
	</div>
</div>
