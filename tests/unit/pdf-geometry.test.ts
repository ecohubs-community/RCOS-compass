import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	MAX_CANVAS_PIXELS,
	lineRect,
	linesFor,
	outputScale,
	scaled,
	stepZoom,
	union,
	type Transform
} from '../../src/lib/components/documents/pdf/geometry.js';

/**
 * Stored line boxes against pdf.js's own viewports: the same library that
 * renders the page decides where its corners are, for every rotation and a
 * cropped page. If this agrees, a highlight sits on its line.
 */
const FIXTURES = join(import.meta.dirname, '../fixtures/documents');

async function viewportsOf(name: string, rotation: number, scale = 1.5) {
	const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
	const data = new Uint8Array(readFileSync(join(FIXTURES, name)));
	const doc = await getDocument({ data, useWasm: false, verbosity: 0 }).promise;
	const page = await doc.getPage(1);
	const viewport = page.getViewport({ scale, rotation: page.rotate + rotation });
	return { viewport, page };
}

const box = { x: 150, y: 600, w: 200, h: 11, start: 0, end: 40 };

describe('a line box on the rendered page', () => {
	it.each([0, 90, 180, 270])(
		'lands where pdf.js puts its corners, rotated by %i degrees',
		async (rotation) => {
			const { viewport } = await viewportsOf('rotated-page.pdf', rotation);
			const rect = lineRect(box, viewport.transform as unknown as Transform);

			const corners = [
				viewport.convertToViewportPoint(box.x, box.y - box.h * 0.22),
				viewport.convertToViewportPoint(box.x + box.w, box.y + box.h * 0.92)
			] as [number, number][];
			const xs = corners.map((c) => c[0]);
			const ys = corners.map((c) => c[1]);
			expect(rect.left).toBeCloseTo(Math.min(...xs));
			expect(rect.top).toBeCloseTo(Math.min(...ys));
			expect(rect.width).toBeCloseTo(Math.max(...xs) - Math.min(...xs));
			expect(rect.height).toBeCloseTo(Math.max(...ys) - Math.min(...ys));
		}
	);

	it('is turned on its side on a page displayed at 90 degrees', async () => {
		const { viewport } = await viewportsOf('rotated-page.pdf', 0, 1);
		const rect = lineRect(box, viewport.transform as unknown as Transform);
		// A horizontal line of the unrotated page runs down the rotated one.
		expect(rect.height).toBeGreaterThan(rect.width);
	});

	it('subtracts the crop box, so a line keeps its place on a cropped page', async () => {
		const { viewport } = await viewportsOf('cropped-page.pdf', 0, 1);
		const rect = lineRect(box, viewport.transform as unknown as Transform);
		// CropBox [100 100 512 692]: x 150 is 50px from the visible left edge, and
		// the baseline at y 600 is 92px below the visible top edge (692).
		expect(rect.left).toBeCloseTo(50);
		expect(rect.top + rect.height).toBeCloseTo(692 - (600 - 11 * 0.22));
		expect(viewport.width).toBe(412);
	});
});

describe('a transform at another zoom', () => {
	it.each([0, 90, 180, 270])(
		'matches pdf.js at scale 2.3 from the scale-1 transform, rotated %i degrees',
		async (rotation) => {
			const { page } = await viewportsOf('cropped-page.pdf', rotation, 1);
			const base = page.getViewport({ scale: 1, rotation: page.rotate + rotation });
			const zoomed = page.getViewport({ scale: 2.3, rotation: page.rotate + rotation });
			const ours = scaled(base.transform as unknown as Transform, 2.3);
			ours.forEach((value, index) => expect(value).toBeCloseTo(zoomed.transform[index]!));
		}
	);
});

describe('which lines an excerpt covers', () => {
	const lines = [
		{ x: 0, y: 30, w: 10, h: 10, start: 0, end: 40 },
		{ x: 0, y: 20, w: 10, h: 10, start: 41, end: 80 },
		{ x: 0, y: 10, w: 10, h: 10, start: 81, end: 120 }
	];

	it('takes only the second of three lines for an excerpt inside it', () => {
		expect(linesFor(lines, [{ start: 50, end: 70 }])).toEqual([lines[1]]);
	});

	it('takes every line an excerpt crosses, and all of them without one', () => {
		expect(linesFor(lines, [{ start: 30, end: 90 }])).toHaveLength(3);
		expect(linesFor(lines, null)).toHaveLength(3);
	});

	it('draws one button over all the lines', () => {
		expect(
			union([
				{ left: 10, top: 10, width: 100, height: 10 },
				{ left: 5, top: 24, width: 40, height: 10 }
			])
		).toEqual({ left: 5, top: 10, width: 105, height: 24 });
	});
});

describe('limits', () => {
	it('keeps a page under the canvas-pixel cap whatever it claims to measure', () => {
		const scale = outputScale(20_000, 20_000, 2);
		expect(20_000 * scale * 20_000 * scale).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
		expect(outputScale(800, 1000, 2)).toBe(2);
	});

	it('zooms in tenths between half and three times fit width', () => {
		expect(stepZoom(1, 1)).toBe(1.1);
		expect(stepZoom(0.5, -1)).toBe(0.5);
		expect(stepZoom(3, 1)).toBe(3);
	});
});
