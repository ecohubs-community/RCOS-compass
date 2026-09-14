/**
 * Where a passage's stored lines land on a rendered PDF page.
 * `openspec/changes/document-original-view`, design.md "Highlight layer".
 *
 * Line boxes are stored in unrotated PDF user space (`document-paragraphs`):
 * `x` and `y` at the start of the baseline, `w` the run's width, `h` its font
 * height. The page's own viewport transform — the one pdf.js renders the canvas
 * with — carries crop box, rotation and zoom, so mapping through it is the whole
 * of the alignment. pdf.js 6 no longer offers `convertToViewportRectangle`; its
 * point conversion is exactly the affine map below, applied to both corners.
 */

export type LineBox = { x: number; y: number; w: number; h: number; start: number; end: number };

/** A viewport's `transform`: `[a, b, c, d, e, f]`. */
export type Transform = readonly [number, number, number, number, number, number];

export type Rect = { left: number; top: number; width: number; height: number };

/**
 * How far below the baseline and above it a line's box reaches, as a share of
 * the font height — so descenders and capitals sit inside the highlight rather
 * than on its edge.
 */
const BELOW = 0.22;
const ABOVE = 0.92;

function point(transform: Transform, x: number, y: number): [number, number] {
	const [a, b, c, d, e, f] = transform;
	return [a * x + c * y + e, b * x + d * y + f];
}

/** One line box, in the rendered page's CSS pixels. */
export function lineRect(box: LineBox, transform: Transform): Rect {
	const [x1, y1] = point(transform, box.x, box.y - box.h * BELOW);
	const [x2, y2] = point(transform, box.x + box.w, box.y + box.h * ABOVE);
	const left = Math.min(x1, x2);
	const top = Math.min(y1, y2);
	return { left, top, width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}

/** The lines an excerpt spans — every line whose `[start, end)` overlaps it — or all of them. */
export function linesFor(
	boxes: readonly LineBox[],
	excerpts: readonly { start: number; end: number }[] | null
): LineBox[] {
	if (!excerpts || excerpts.length === 0) return [...boxes];
	return boxes.filter((box) =>
		excerpts.some((excerpt) => box.start < excerpt.end && excerpt.start < box.end)
	);
}

/** The smallest rectangle holding every rect: what a highlight's button covers. */
export function union(rects: readonly Rect[]): Rect | null {
	if (rects.length === 0) return null;
	const left = Math.min(...rects.map((r) => r.left));
	const top = Math.min(...rects.map((r) => r.top));
	const right = Math.max(...rects.map((r) => r.left + r.width));
	const bottom = Math.max(...rects.map((r) => r.top + r.height));
	return { left, top, width: right - left, height: bottom - top };
}

/**
 * A viewport's transform at another zoom. pdf.js's transform is the page's
 * scale-1 transform multiplied through by the scale — offsets included — so a
 * highlight can be placed before (or without) its page being drawn.
 */
export function scaled(transform: Transform, scale: number): Transform {
	return transform.map((value) => value * scale) as unknown as Transform;
}

/**
 * Pages the original view lays out. A file can declare any number; past this
 * the viewer shows the first ones and says so, rather than asking a tab for a
 * slot, an observer and a thumbnail per page of a 50 000-page PDF.
 */
export const MAX_VIEWER_PAGES = 1000;

/** Canvas pixels one page may take, device pixels included. Above it, a page renders softer. */
export const MAX_CANVAS_PIXELS = 16_000_000;

/**
 * The backing-store scale for a page drawn `cssWidth × cssHeight` CSS pixels
 * wide: the device pixel ratio, unless that would pass the pixel cap — a
 * crafted page size is not allowed to ask a tab for a gigabyte of canvas.
 */
export function outputScale(cssWidth: number, cssHeight: number, devicePixelRatio: number): number {
	const area = cssWidth * cssHeight;
	if (area <= 0) return 1;
	return Math.max(0.1, Math.min(devicePixelRatio, Math.sqrt(MAX_CANVAS_PIXELS / area)));
}

/** Zoom steps: 10% at a time, between 50% and 300% of fit width. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export function stepZoom(zoom: number, direction: 1 | -1): number {
	const next = Math.round((zoom + direction * 0.1) * 10) / 10;
	return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}
