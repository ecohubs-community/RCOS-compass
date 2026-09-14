<script lang="ts">
	import type { PDFDocumentProxy } from 'pdfjs-dist';
	import * as m from '$lib/paraglide/messages';
	import { outputScale } from './geometry.js';

	/**
	 * The page strip beside the original. Design 05.
	 *
	 * Each thumbnail is a link to `?page=`, so the strip works as navigation before
	 * any canvas is drawn; the canvases themselves are drawn only while they are
	 * in the strip's view. A dot marks a page holding governance language — with
	 * the page number beside it in the label, never the dot alone.
	 *
	 * Deviation from the mock, recorded in design.md: the strip scrolls, rather
	 * than showing seven pages and a "+4".
	 */
	type Props = {
		pdf: PDFDocumentProxy;
		sizes: readonly { width: number; height: number }[];
		governancePages: readonly number[];
		current: number;
		pageHref: (page: number) => string;
		onpage?: (page: number, event: MouseEvent) => void;
	};

	let { pdf, sizes, governancePages, current, pageHref, onpage }: Props = $props();

	const WIDTH = 44;
	let strip = $state<HTMLElement | null>(null);
	let seen = $state(new Set<number>());

	/** Mark thumbnails as they come into the strip's view; drawn ones stay drawn. */
	function watch(node: HTMLElement, page: number) {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting) && !seen.has(page)) {
					seen = new Set([...seen, page]);
				}
			},
			{ root: strip, rootMargin: '120px 0px' }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	function draw(canvas: HTMLCanvasElement, page: number) {
		let cancelled = false;
		(async () => {
			try {
				const proxy = await pdf.getPage(page);
				if (cancelled) return;
				const viewport = proxy.getViewport({
					scale: WIDTH / proxy.getViewport({ scale: 1 }).width
				});
				const ratio = outputScale(viewport.width, viewport.height, window.devicePixelRatio || 1);
				canvas.width = Math.floor(viewport.width * ratio);
				canvas.height = Math.floor(viewport.height * ratio);
				const { AnnotationMode } = await import('pdfjs-dist');
				await proxy.render({
					canvas,
					canvasContext: canvas.getContext('2d')!,
					viewport,
					transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
					annotationMode: AnnotationMode.DISABLE
				}).promise;
			} catch {
				// A thumbnail that cannot be drawn stays a numbered blank; the page
				// itself reports its own failure.
			}
		})();
		return { destroy: () => (cancelled = true) };
	}

	const governance = $derived(new Set(governancePages));
</script>

<!--
	eslint-disable svelte/no-navigation-without-resolve --
	Every href here is a query on the workspace page itself (`?page=`, `?view=`),
	built by the page's own helpers; there is no route id to resolve.
-->

<nav
	bind:this={strip}
	class="border-border flex w-[4.5rem] flex-none flex-col items-center gap-2 overflow-y-auto border-r py-3"
	aria-label={m.original_pages_label()}
>
	{#each sizes as size, index (index)}
		{@const page = index + 1}
		<a
			href={pageHref(page)}
			use:watch={page}
			class="relative flex flex-none flex-col items-center gap-0.5 rounded-[3px] p-0.5 {current ===
			page
				? 'outline-accent-fg outline-1'
				: ''}"
			aria-current={current === page ? 'page' : undefined}
			aria-label={governance.has(page)
				? m.original_thumbnail_governance({ page })
				: m.original_thumbnail({ page })}
			data-thumbnail={page}
			data-governance={governance.has(page) ? 'true' : undefined}
			onclick={(event) => onpage?.(page, event)}
		>
			<!-- style= exception 1 (docs/02 §5): the page's own proportions. -->
			<span
				class="bg-paper border-border relative block overflow-hidden rounded-[2px] border"
				style="width: {WIDTH}px; height: {Math.round((size.height / size.width) * WIDTH)}px;"
			>
				{#if seen.has(page)}
					<canvas use:draw={page} class="h-full w-full" data-drawn="true"></canvas>
				{/if}
				{#if governance.has(page)}
					<span class="bg-accent absolute top-1 right-1 h-1.5 w-1.5 rounded-full" aria-hidden="true"
					></span>
				{/if}
			</span>
			<span class="text-fg-muted text-[10px]" data-tabular aria-hidden="true">{page}</span>
		</a>
	{/each}
</nav>
