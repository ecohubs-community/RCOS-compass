<script lang="ts" module>
	export type Highlight = {
		passageId: string;
		page: number;
		number: number;
		state: 'open' | 'confirmed';
		words: string;
		lines: { x: number; y: number; w: number; h: number; start: number; end: number }[];
		excerpts: { start: number; end: number }[] | null;
	};

	/**
	 * The same distinction the text view draws: open is a dashed edge, confirmed a
	 * solid one, and selected adds an outline — never the tint alone.
	 */
	const LINE: Record<Highlight['state'], string> = {
		open: 'bg-attention/20 border-b-2 border-dashed border-attention',
		confirmed: 'bg-accent/25 border-b-2 border-solid border-accent-deep'
	};
</script>

<script lang="ts">
	import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
	import * as m from '$lib/paraglide/messages';
	import { lineRect, linesFor, outputScale, union, type Transform } from './geometry.js';

	/**
	 * One page of the original: canvas, text layer and highlights, drawn only
	 * while it is near the viewport and released when it is not.
	 */
	type Props = {
		pdf: PDFDocumentProxy;
		lib: typeof import('pdfjs-dist');
		number: number;
		/** The page's size at scale 1, in CSS pixels. */
		size: { width: number; height: number };
		scale: number;
		near: boolean;
		highlights: readonly Highlight[];
		selected: string | null;
		onselect: (passageId: string) => void;
		onfail: (problem: unknown) => void;
	};

	let { pdf, lib, number, size, scale, near, highlights, selected, onselect, onfail }: Props =
		$props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let textLayer = $state<HTMLDivElement | null>(null);
	let transform = $state<Transform | null>(null);

	const width = $derived(Math.floor(size.width * scale));
	const height = $derived(Math.floor(size.height * scale));

	$effect(() => {
		if (!near || !canvas || !textLayer) return;
		const target = canvas;
		const layer = textLayer;
		const wanted = scale;
		let task: RenderTask | null = null;
		let cancelled = false;
		let text: InstanceType<typeof lib.TextLayer> | null = null;

		(async () => {
			try {
				const page = await pdf.getPage(number);
				if (cancelled) return;
				const viewport = page.getViewport({ scale: wanted });
				const ratio = outputScale(viewport.width, viewport.height, window.devicePixelRatio || 1);
				target.width = Math.floor(viewport.width * ratio);
				target.height = Math.floor(viewport.height * ratio);
				transform = viewport.transform as unknown as Transform;

				task = page.render({
					canvas: target,
					canvasContext: target.getContext('2d')!,
					viewport,
					transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
					// No annotation is drawn or made interactive: a document cannot
					// hand a member a link, a form or a widget.
					annotationMode: lib.AnnotationMode.DISABLE
				});
				await task.promise;
				if (cancelled) return;

				layer.replaceChildren();
				text = new lib.TextLayer({
					textContentSource: page.streamTextContent(),
					container: layer,
					viewport
				});
				await text.render();
			} catch (problem) {
				if (cancelled || problem instanceof lib.RenderingCancelledException) return;
				onfail(problem);
			}
		})();

		return () => {
			cancelled = true;
			task?.cancel();
			text?.cancel();
			// Far pages give their memory back: the canvas shrinks to nothing and
			// the page's decoded resources are released.
			target.width = 0;
			target.height = 0;
			layer.replaceChildren();
			void pdf.getPage(number).then((page) => page.cleanup());
		};
	});

	const drawn = $derived.by(() => {
		if (!transform) return [];
		const at = transform;
		return highlights.flatMap((highlight) => {
			const rects = linesFor(highlight.lines, highlight.excerpts).map((line) => lineRect(line, at));
			const box = union(rects);
			return box ? [{ highlight, box, rects }] : [];
		});
	});

	const label = (highlight: Highlight) =>
		m.original_highlight_label({
			number: highlight.number,
			words: highlight.words,
			state:
				highlight.state === 'confirmed' ? m.original_state_confirmed() : m.original_state_open()
		});
</script>

<!-- style= exception 1 (docs/02 §5): page geometry and pdf.js's scale property come from the file. -->
<div
	class="pdf-page bg-paper relative mx-auto shadow-sm"
	style="width: {width}px; height: {height}px; --total-scale-factor: {scale};"
	data-page={number}
>
	<canvas bind:this={canvas} class="absolute inset-0 h-full w-full" aria-hidden="true"></canvas>
	<div bind:this={textLayer} class="textLayer"></div>
	{#each drawn as { highlight, box, rects } (highlight.passageId)}
		<button
			type="button"
			class="absolute z-10 cursor-pointer rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 {selected ===
			highlight.passageId
				? 'outline-accent-deep outline-2 outline-offset-2'
				: ''}"
			style="left: {box.left}px; top: {box.top}px; width: {box.width}px; height: {box.height}px;"
			aria-label={label(highlight)}
			aria-pressed={selected === highlight.passageId}
			data-highlight={highlight.passageId}
			onclick={() => onselect(highlight.passageId)}
		>
			{#each rects as rect, index (index)}
				<span
					class="absolute {LINE[highlight.state]}"
					style="left: {rect.left - box.left}px; top: {rect.top -
						box.top}px; width: {rect.width}px; height: {rect.height}px;"
					aria-hidden="true"
				></span>
			{/each}
		</button>
	{/each}
</div>
