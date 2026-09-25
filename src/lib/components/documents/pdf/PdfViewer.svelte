<script lang="ts" module>
	import type { Highlight } from './PdfPage.svelte';
	import type { SelectedWords } from '$lib/shared/excerpt';
	import type { ParagraphLines } from './geometry.js';

	/** A highlight as the workspace sends it: its lines come from `paragraphs`. */
	export type ViewerHighlight = Omit<Highlight, 'lines'>;

	export type PdfViewerProps = {
		url: string;
		highlights: readonly ViewerHighlight[];
		/** Every paragraph's lines, identified or not. */
		paragraphs: readonly ParagraphLines[];
		governancePages: readonly number[];
		selected: string | null;
		/** `?page=` as asked; null starts at the top. */
		page: number | null;
		pageHref: (page: number) => string;
		/** Where the Text switch goes, for the page the viewer is showing. */
		textHref: (page: number) => string;
		/** Whether to show the page strip — not at phone widths. */
		thumbnails?: boolean;
		onselect: (passageId: string) => void;
		/** Words selected inside one paragraph. */
		onexcerpt?: (selection: SelectedWords) => void;
		/** A selection that runs from one paragraph into another. */
		onselectionproblem?: () => void;
		/**
		 * What the hand-map card is about to map, drawn over the page while it is
		 * open: the excerpt's lines, or the whole paragraph's when it is null.
		 */
		pending?: { passageId: string; excerpt: { start: number; end: number } | null } | null;
		onready?: () => void;
		onfail: () => void;
		onpage?: (page: number, event: MouseEvent) => void;
	};
</script>

<script lang="ts">
	import type { PDFDocumentProxy } from 'pdfjs-dist';
	import { onMount, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import * as m from '$lib/paraglide/messages';
	import IconMinus from '~icons/tabler/minus';
	import IconPlus from '~icons/tabler/plus';
	import PageThumbnails from './PageThumbnails.svelte';
	import PdfPage from './PdfPage.svelte';
	import {
		MAX_VIEWER_PAGES,
		hitLine,
		lineBox,
		lineRect,
		linesFor,
		nearOffset,
		scaled,
		stepZoom,
		toUserSpace,
		union,
		type Transform
	} from './geometry.js';
	import { openPdf } from './load.js';

	/**
	 * The PDF as it was uploaded. Design 05's document pane; the change's
	 * `document-viewer` spec, "A PDF can be seen as it was uploaded".
	 *
	 * Client-only and loaded on demand: the workspace server-renders the text view
	 * in the same place, and this replaces it once the file has opened — and hands
	 * back to it, through `onfail`, if anything about opening or drawing the file
	 * goes wrong. The pane is never blank.
	 *
	 * Pages within a screen of the viewport are drawn; the rest are sized boxes.
	 * Scrolling never writes the URL: `?page=` and `?passage=` move the view, and
	 * the view does not move them back, so the two cannot chase each other.
	 */
	type Props = PdfViewerProps;

	let {
		url,
		highlights: sent,
		paragraphs,
		governancePages,
		selected,
		page,
		pageHref,
		textHref,
		thumbnails = true,
		onselect,
		onexcerpt,
		onselectionproblem,
		pending = null,
		onready,
		onfail,
		onpage
	}: Props = $props();

	/** Each paragraph's line boxes, by passage. */
	const boxes = $derived(
		new Map(paragraphs.map((paragraph) => [paragraph.passageId, paragraph.lines.map(lineBox)]))
	);
	/** The paragraphs on each page, for telling which one a point is in. */
	const byPage = $derived(
		Map.groupBy(
			paragraphs.map((paragraph) => ({
				passageId: paragraph.passageId,
				page: paragraph.page,
				lines: boxes.get(paragraph.passageId) ?? []
			})),
			(paragraph) => paragraph.page
		)
	);
	const pageOf = $derived(
		new Map(paragraphs.map((paragraph) => [paragraph.passageId, paragraph.page]))
	);
	const highlights = $derived(
		sent.flatMap((highlight) => {
			const lines = boxes.get(highlight.passageId);
			return lines ? [{ ...highlight, lines }] : [];
		})
	);

	let pdf = $state.raw<PDFDocumentProxy | null>(null);
	let lib = $state.raw<typeof import('pdfjs-dist') | null>(null);
	let sizes = $state.raw<{ width: number; height: number; transform: Transform }[]>([]);
	let truncated = $state(false);
	let zoom = $state(1);
	let width = $state(0);
	let scroller = $state<HTMLElement | null>(null);
	const near = new SvelteSet<number>([1]);
	let current = $state(1);
	let failed = false;

	function fail(problem: unknown) {
		if (failed) return;
		failed = true;
		// Logged without the file name: a filename can carry a person's name.
		console.warn('The original view could not render this document.', problem);
		onfail();
	}

	onMount(() => {
		let destroyed = false;
		let opened: PDFDocumentProxy | null = null;
		(async () => {
			try {
				const result = await openPdf(url);
				opened = result.pdf;
				if (destroyed) return void result.pdf.loadingTask.destroy();
				const measured = [];
				const count = Math.min(result.pdf.numPages, MAX_VIEWER_PAGES);
				for (let n = 1; n <= count; n++) {
					const viewport = (await result.pdf.getPage(n)).getViewport({ scale: 1 });
					measured.push({
						width: viewport.width,
						height: viewport.height,
						transform: viewport.transform as unknown as Transform
					});
				}
				truncated = result.pdf.numPages > count;
				if (destroyed) return;
				lib = result.lib;
				sizes = measured;
				pdf = result.pdf;
				onready?.();
			} catch (problem) {
				if (!destroyed) fail(problem);
			}
		})();
		return () => {
			destroyed = true;
			void opened?.loadingTask.destroy();
		};
	});

	/** Fit width, then the member's zoom on top of it. */
	const fit = $derived(
		(index: number) => (width > 0 && sizes[index] ? (width - 32) / sizes[index]!.width : 1) * zoom
	);

	function watch(node: HTMLElement, number: number) {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) near.add(number);
					else near.delete(number);
				}
			},
			{ root: scroller, rootMargin: '100% 0px' }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	/**
	 * Until when a scroll is the viewer's own doing. A scroll it caused — revealing a
	 * page or a passage — must not be read back as the member moving, or asking for
	 * page 3 near the end of a document would report whichever page the scroll
	 * could reach.
	 */
	let ownScrollUntil = 0;

	/** The page at the top of the viewport, for the toolbar — never for the URL. */
	function track() {
		if (!scroller || performance.now() < ownScrollUntil) return;
		const middle = scroller.scrollTop + 24;
		for (const node of scroller.querySelectorAll<HTMLElement>('[data-page-slot]')) {
			if (node.offsetTop + node.offsetHeight > middle) {
				current = Number(node.dataset.pageSlot);
				return;
			}
		}
	}

	function slot(number: number) {
		return scroller?.querySelector<HTMLElement>(`[data-page-slot="${number}"]`) ?? null;
	}

	/** Bring a page, or a passage's highlight a third of the way down, into view. */
	async function reveal(target: { page: number; passage?: string }) {
		await tick();
		const node = slot(target.page);
		if (!scroller || !node) return;
		let top = node.offsetTop - 12;
		// Any paragraph, identified or not: selecting one the member just clicked
		// must find it already in view, not fall back to the top of its page.
		const lines = target.passage ? boxes.get(target.passage) : undefined;
		const excerpts = highlights.find((item) => item.passageId === target.passage)?.excerpts ?? null;
		const size = sizes[target.page - 1];
		if (lines && size) {
			const at = scaled(size.transform, fit(target.page - 1));
			const box = union(linesFor(lines, excerpts).map((line) => lineRect(line, at)));
			if (box) {
				// Already in full view — the member most likely just clicked it — and
				// the document stays where it is.
				const boxTop = node.offsetTop + box.top;
				const visible =
					boxTop >= scroller.scrollTop &&
					boxTop + box.height <= scroller.scrollTop + scroller.clientHeight;
				if (visible) {
					current = target.page;
					return;
				}
				top = boxTop - scroller.clientHeight / 3;
			}
		}
		ownScrollUntil = performance.now() + 400;
		scroller.scrollTo({ top: Math.max(0, top) });
		current = target.page;
	}

	// `?passage=` wins over `?page=`, as in the text view. Each is acted on when it
	// changes — not on every redraw, so zooming never yanks the view away.
	let revealed = '';
	$effect(() => {
		if (!pdf || sizes.length === 0) return;
		const passagePage = selected ? pageOf.get(selected) : undefined;
		const key = `${selected ?? ''}|${page ?? ''}`;
		if (key === revealed) return;
		revealed = key;
		if (passagePage) void reveal({ page: passagePage, passage: selected! });
		else if (page) void reveal({ page: Math.min(Math.max(page, 1), sizes.length) });
	});

	const onPage = (number: number) => highlights.filter((item) => item.page === number);

	/** The lines the hand-map card is about to map, on the page they are on. */
	const pendingLines = $derived.by(() => {
		if (!pending) return null;
		const lines = boxes.get(pending.passageId);
		const page = pageOf.get(pending.passageId);
		if (!lines || page === undefined) return null;
		return { page, lines: linesFor(lines, pending.excerpt ? [pending.excerpt] : null) };
	});

	/**
	 * The paragraph under a point on screen, if any: which page the point is on,
	 * then back through that page's transform into user space, where the stored
	 * line boxes live.
	 */
	function locate(clientX: number, clientY: number) {
		if (!scroller) return null;
		for (const node of scroller.querySelectorAll<HTMLElement>('[data-page]')) {
			const rect = node.getBoundingClientRect();
			if (
				clientX < rect.left ||
				clientX > rect.right ||
				clientY < rect.top ||
				clientY > rect.bottom
			) {
				continue;
			}
			const number = Number(node.dataset.page);
			const size = sizes[number - 1];
			if (!size) return null;
			const at = scaled(size.transform, fit(number - 1));
			const user = toUserSpace(at, clientX - rect.left, clientY - rect.top);
			const hit = hitLine(user, byPage.get(number) ?? []);
			return hit ? { ...hit, user } : null;
		}
		return null;
	}

	const middle = (rect: DOMRect) =>
		[rect.left + rect.width / 2, rect.top + rect.height / 2] as const;

	/**
	 * A selection, once it has settled. Called on pointer-up for a mouse and after
	 * `selectionchange` has been quiet for touch, whose handles fire no pointer-up
	 * — so the same selection can arrive twice, and is reported once.
	 */
	let reported: [Node, number, Node, number] | null = null;
	function readSelection() {
		const selection = window.getSelection();
		if (!onexcerpt || !scroller || !selection || selection.rangeCount === 0) return;
		if (selection.isCollapsed) {
			// Selecting the same words again, after a click, is a new selection.
			reported = null;
			return;
		}
		const range = selection.getRangeAt(0);
		if (!scroller.contains(range.commonAncestorContainer)) return;
		const key: [Node, number, Node, number] = [
			range.startContainer,
			range.startOffset,
			range.endContainer,
			range.endOffset
		];
		if (reported?.every((part, index) => part === key[index])) return;
		reported = key;

		const words = selection.toString();
		const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
		if (words.trim() === '' || rects.length === 0) return;
		const start = locate(...middle(rects[0]!));
		// Starting in a heading, a margin or a running header: nothing to map.
		if (!start) return;
		const end = locate(...middle(rects.at(-1)!));
		if (end && end.passageId !== start.passageId) {
			onselectionproblem?.();
			return;
		}
		onexcerpt?.({
			passageId: start.passageId,
			words,
			near: nearOffset(start.line, start.user)
		});
	}

	let settle: ReturnType<typeof setTimeout> | undefined;
	onMount(() => {
		const changed = () => {
			clearTimeout(settle);
			settle = setTimeout(readSelection, 400);
		};
		document.addEventListener('selectionchange', changed);
		return () => {
			clearTimeout(settle);
			document.removeEventListener('selectionchange', changed);
		};
	});

	/**
	 * A click that selected no words: the paragraph under it, identified or not.
	 * Only where the viewer maps by hand — a viewer given no `onexcerpt` (the
	 * phone's "view original page") selects through its highlights alone.
	 */
	function clickParagraph(event: MouseEvent) {
		if (!onexcerpt) return;
		if (!(event.target instanceof Element) || event.target.closest('button, a')) return;
		if (window.getSelection()?.isCollapsed === false) return;
		const hit = locate(event.clientX, event.clientY);
		if (hit) onselect(hit.passageId);
	}
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	Every href here is a query on the workspace page itself (`?page=`, `?view=`),
	built by the page's own helpers; there is no route id to resolve.
-->

<div class="flex min-h-0 flex-1 flex-col" data-original-view>
	<div class="border-border flex flex-none flex-wrap items-center gap-2 border-b px-3.5 py-2">
		{#if sizes.length > 0}
			{#if current > 1}
				<a
					href={pageHref(current - 1)}
					class="border-border text-fg-secondary hover:text-fg text-meta rounded-(--radius-control) border px-2 py-1"
					aria-label={m.workspace_page_prev({ page: current - 1 })}>‹</a
				>
			{/if}
			<span class="text-fg-secondary text-meta" data-tabular>
				{m.workspace_page_of({ page: current, count: sizes.length })}
			</span>
			{#if current < sizes.length}
				<a
					href={pageHref(current + 1)}
					class="border-border text-fg-secondary hover:text-fg text-meta rounded-(--radius-control) border px-2 py-1"
					aria-label={m.workspace_page_next({ page: current + 1 })}>›</a
				>
			{/if}
			<span class="flex-1"></span>
			<div
				class="border-border inline-flex items-center overflow-hidden rounded-(--radius-control) border"
			>
				<button
					type="button"
					class="text-fg-secondary hover:text-fg h-7 w-7 cursor-pointer disabled:opacity-40"
					aria-label={m.original_zoom_out()}
					disabled={zoom <= 0.5}
					onclick={() => (zoom = stepZoom(zoom, -1))}
				>
					<IconMinus class="mx-auto h-3.5 w-3.5" aria-hidden="true" />
				</button>
				<button
					type="button"
					class="text-fg border-border text-meta h-7 cursor-pointer border-x px-2"
					aria-label={m.original_zoom_fit()}
					onclick={() => (zoom = 1)}
					data-tabular>{Math.round(zoom * 100)}%</button
				>
				<button
					type="button"
					class="text-fg-secondary hover:text-fg h-7 w-7 cursor-pointer disabled:opacity-40"
					aria-label={m.original_zoom_in()}
					disabled={zoom >= 3}
					onclick={() => (zoom = stepZoom(zoom, 1))}
				>
					<IconPlus class="mx-auto h-3.5 w-3.5" aria-hidden="true" />
				</button>
			</div>
		{:else}
			<span class="text-fg-muted text-meta" role="status">{m.original_opening()}</span>
			<span class="flex-1"></span>
		{/if}
		<a href={textHref(current)} class="text-accent-fg text-meta">{m.original_switch_text()}</a>
	</div>

	<div class="flex min-h-0 flex-1">
		{#if pdf && thumbnails}
			<PageThumbnails {pdf} {sizes} {governancePages} {current} {pageHref} {onpage} />
		{/if}
		<!-- A click or a selection on the page is a pointer convenience: the highlights are
		     the viewer's keyboard stops, and the text view is the keyboard route to mapping
		     any paragraph by hand (`pdf-selection-mapping`, design "Decided with the owner"). -->
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			bind:this={scroller}
			bind:clientWidth={width}
			class="relative min-h-0 flex-1 overflow-auto py-4"
			onscroll={track}
			onpointerup={() => setTimeout(readSelection)}
			data-original-scroller
			onclick={clickParagraph}
		>
			{#if truncated}
				<p class="text-fg-secondary text-meta px-4 pb-3" role="status">
					{m.original_truncated({ count: MAX_VIEWER_PAGES })}
				</p>
			{/if}
			{#if pdf && lib}
				<!-- The bottom room lets the last pages scroll to the top, where a revealed page belongs. -->
				<div class="flex flex-col gap-4 pb-[50vh]">
					{#each sizes as size, index (index)}
						{@const number = index + 1}
						<div data-page-slot={number} use:watch={number}>
							<PdfPage
								{pdf}
								{lib}
								{number}
								{size}
								scale={fit(index)}
								near={near.has(number)}
								highlights={onPage(number)}
								pending={pendingLines?.page === number ? pendingLines.lines : null}
								{selected}
								{onselect}
								onfail={fail}
							/>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
