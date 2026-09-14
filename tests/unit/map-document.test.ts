import { describe, expect, it } from 'vitest';
import { cleanReason, locateExcerpt } from '../../src/lib/server/ai/tasks/map-document.js';

/**
 * The two judgements the mapping task makes about a model's words before any of
 * them reach a member: is the reason a usable sentence, and are the quoted words
 * really in the passage.
 */
describe('a reason', () => {
	it('is kept as one plain line', () => {
		expect(cleanReason('  Names the notice period,\n\tnot the settlement. ')).toBe(
			'Names the notice period, not the settlement.'
		);
	});

	it('loses control characters rather than carrying them to a screen', () => {
		const withControls = `Covers leaving${String.fromCharCode(0)}${String.fromCharCode(27)} and returning.`;
		expect(cleanReason(withControls)).toBe('Covers leaving and returning.');
	});

	it('is refused when missing, empty or longer than one sentence can be', () => {
		expect(cleanReason(undefined)).toBeNull();
		expect(cleanReason('   \n ')).toBeNull();
		expect(cleanReason('x'.repeat(201))).toBeNull();
		expect(cleanReason('x'.repeat(200))).toBe('x'.repeat(200));
	});

	it('is not a place markup becomes markup — it stays the characters it was', () => {
		// Rendering is text-only; the task's job is only not to transform it into
		// anything else on the way.
		const hostile = '<a href="https://evil.example">Click</a> **now**';
		expect(cleanReason(hostile)).toBe(hostile);
	});
});

describe('an excerpt', () => {
	const passage =
		'Any member wishing to depart shall give\n  sixty days written notice. The council may shorten it.';

	it('is located in the original text, whatever the whitespace', () => {
		const at = locateExcerpt(passage, 'shall give sixty   days written notice.');
		expect(at).not.toBeNull();
		expect(passage.slice(at!.start, at!.end)).toBe('shall give\n  sixty days written notice.');
	});

	it('is dropped when the words are not really there', () => {
		expect(locateExcerpt(passage, 'shall give ninety days notice')).toBeNull();
		expect(locateExcerpt(passage, '')).toBeNull();
		expect(locateExcerpt(passage, undefined)).toBeNull();
	});

	it('finds the start of the passage, not only its middle', () => {
		expect(locateExcerpt(passage, 'Any member')).toEqual({ start: 0, end: 10 });
	});
});
