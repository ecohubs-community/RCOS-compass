import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	MAX_CANVAS_PIXELS,
	hitLine,
	inverse,
	lineRect,
	linesFor,
	outputScale,
	scaled,
	nearOffset,
	stepZoom,
	toUserSpace,
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

// The first test loads pdf.js itself, which takes a few seconds on a busy machine.
describe('a line box on the rendered page', { timeout: 30_000 }, () => {
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

describe('a transform at another zoom', { timeout: 30_000 }, () => {
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

describe('a point on the rendered page, back in user space', { timeout: 30_000 }, () => {
	const cases = [
		['rotated-page.pdf', 0],
		['rotated-page.pdf', 90],
		['cropped-page.pdf', 0],
		['cropped-page.pdf', 270]
	] as const;

	it.each(cases.flatMap(([name, rotation]) => [1, 2.3].map((zoom) => [name, rotation, zoom])))(
		'returns to where it came from on %s rotated %i degrees at zoom %d',
		async (name, rotation, zoom) => {
			const { page } = await viewportsOf(name as string, rotation as number, 1);
			const base = page.getViewport({ scale: 1, rotation: page.rotate + (rotation as number) });
			const transform = scaled(base.transform as unknown as Transform, zoom as number);
			const rect = lineRect(box, transform);

			// The middle of the drawn line comes back as a point on the stored one.
			const [x, y] = toUserSpace(transform, rect.left + rect.width / 2, rect.top + rect.height / 2);
			expect(x).toBeCloseTo(box.x + box.w / 2);
			expect(y).toBeCloseTo(box.y + (box.h * (0.92 - 0.22)) / 2);
		}
	);

	it('undoes the transform exactly', () => {
		const transform: Transform = [0, 1.5, 1.5, 0, -150, -150];
		const back = inverse(inverse(transform));
		back.forEach((value, index) => expect(value).toBeCloseTo(transform[index]!));
	});
});

describe('which paragraph a point falls on', () => {
	const first = {
		passageId: 'first',
		lines: [
			{ x: 72, y: 680, w: 300, h: 11, start: 0, end: 60 },
			{ x: 72, y: 664, w: 200, h: 11, start: 61, end: 100 }
		]
	};
	const second = {
		passageId: 'second',
		lines: [{ x: 72, y: 632, w: 300, h: 11, start: 0, end: 58 }]
	};

	it('finds the paragraph and the line a point is on', () => {
		expect(hitLine([100, 667], [first, second])).toEqual({
			passageId: 'first',
			line: first.lines[1]
		});
		expect(hitLine([300, 635], [first, second])?.passageId).toBe('second');
	});

	it('finds nothing in the margin', () => {
		expect(hitLine([20, 667], [first, second])).toBeNull();
		expect(hitLine([500, 682], [first, second])).toBeNull();
		expect(hitLine([100, 760], [first, second])).toBeNull();
	});

	it('takes a point in the leading between two lines to the nearer line', () => {
		// First line's padded box runs down to 680 - 2.42; the second's up to 664 + 10.12.
		expect(hitLine([100, 676.5], [first, second])?.line).toBe(first.lines[0]);
		expect(hitLine([100, 674.9], [first, second])?.line).toBe(first.lines[1]);
	});

	it('says roughly where along the line a point is, in the passage text', () => {
		const line = first.lines[0]!;
		expect(nearOffset(line, [72, 0])).toBe(0);
		expect(nearOffset(line, [222, 0])).toBe(30);
		expect(nearOffset(line, [900, 0])).toBe(60);
	});
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
