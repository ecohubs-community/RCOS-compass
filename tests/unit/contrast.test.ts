import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Contrast, checked where the colours are defined.
 * `docs/02-component-guidelines.md` §5 and §6.
 *
 * Spec-review row 32 was an accessibility bug baked into the tokens: muted grey
 * on the dark ground at 11px, below AA. It was fixed in P0 by lifting two
 * values — and nothing checks it, so the next person to darken a colour finds
 * out from a user.
 *
 * This asserts the ratios against `app.css` rather than against a rendered page,
 * for the same reason the token check exists at all: a component cannot
 * introduce a colour, so the file is the whole surface. A page test would also
 * pass while a token used on a screen nobody wrote yet was below the line.
 */
const CSS = readFileSync('src/app.css', 'utf8');

/** WCAG 2.1: 4.5 for body text, 3.0 for large text and non-text boundaries. */
const AA_TEXT = 4.5;
const AA_LARGE = 3;

function token(name: string): string {
	const match = new RegExp(`--color-${name}:\\s*(#[0-9a-f]{3,8})`, 'i').exec(CSS);
	if (!match) throw new Error(`no --color-${name} in app.css`);
	return match[1]!;
}

function luminance(hex: string): number {
	const value = hex.replace('#', '');
	const full =
		value.length === 3
			? value
					.split('')
					.map((c) => c + c)
					.join('')
			: value.slice(0, 6);
	const channels = [0, 2, 4].map((offset) => {
		const raw = parseInt(full.slice(offset, offset + 2), 16) / 255;
		return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrast(a: string, b: string): number {
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (light! + 0.05) / (dark! + 0.05);
}

/** `top` at `alpha` over `under`, as a hex colour — a tinted fill as the eye sees it. */
function blend(top: string, under: string, alpha: number): string {
	const rgb = (hex: string) =>
		[0, 2, 4].map((i) => parseInt(hex.replace('#', '').slice(i, i + 2), 16));
	const [a, b] = [rgb(top), rgb(under)];
	return `#${a
		.map((channel, i) => Math.round(channel * alpha + b[i]! * (1 - alpha)))
		.map((channel) => channel.toString(16).padStart(2, '0'))
		.join('')}`;
}

/** Each pair, with the size it is actually used at. */
const PAIRS: { fg: string; bg: string; needs: number; where: string }[] = [
	{ fg: 'fg', bg: 'bg', needs: AA_TEXT, where: 'body text' },
	{ fg: 'fg', bg: 'surface', needs: AA_TEXT, where: 'body text on a card' },
	{ fg: 'fg', bg: 'raised', needs: AA_TEXT, where: 'text in a control' },
	{ fg: 'fg-secondary', bg: 'bg', needs: AA_TEXT, where: 'supporting text' },
	{ fg: 'fg-secondary', bg: 'surface', needs: AA_TEXT, where: 'supporting text on a card' },
	// The one row 32 was about: 11px in the sidebar and table footers, so it is
	// held to the body-text threshold rather than the large-text one.
	{ fg: 'fg-muted', bg: 'bg', needs: AA_TEXT, where: 'meta text at 11px' },
	{ fg: 'fg-muted', bg: 'surface', needs: AA_TEXT, where: 'meta text on a card' },
	{ fg: 'accent-fg', bg: 'bg', needs: AA_TEXT, where: 'links and focus rings' },
	{ fg: 'accent-fg', bg: 'surface', needs: AA_TEXT, where: 'links on a card' },
	{ fg: 'attention', bg: 'bg', needs: AA_TEXT, where: 'warnings' },
	{ fg: 'attention', bg: 'surface', needs: AA_TEXT, where: 'warnings on a card' },
	/**
	 * The focus indicator, which is the non-text contrast WCAG 1.4.11 is actually
	 * about here.
	 *
	 * `--color-border-strong` on the page ground is 1.8:1 and deliberately not in
	 * this table. It is a *hover* border on a secondary button and a *focus*
	 * border on a text field — decoration on a control that is already identified
	 * by its fill and its label, sitting under a 2px accent outline that carries
	 * the state. Holding it to 3:1 would darken the interface to satisfy a rule it
	 * is not the subject of; what must clear the line is the ring, and it does.
	 */
	{ fg: 'accent-fg', bg: 'raised', needs: AA_LARGE, where: 'the focus ring on a control' },
	// The text view's sheet, which is light.
	{ fg: 'paper-ink', bg: 'paper', needs: AA_TEXT, where: 'document text' },
	{ fg: 'paper-muted', bg: 'paper', needs: AA_TEXT, where: 'page and paragraph numbers' },
	{ fg: 'accent-deep', bg: 'paper', needs: AA_LARGE, where: 'the selected passage outline' }
];

describe('the design tokens clear AA where they are used', () => {
	it.each(PAIRS)('$fg on $bg — $where', ({ fg, bg, needs }) => {
		const ratio = contrast(token(fg), token(bg));
		expect(
			Number(ratio.toFixed(2)),
			`--color-${fg} on --color-${bg} is ${ratio.toFixed(2)}:1, below ${needs}:1`
		).toBeGreaterThanOrEqual(needs);
	});

	/**
	 * A chip's text sits on its own colour at 12% over a card, not on the card.
	 * The gallery's axe run found `info` on that tint at 4.3:1; the table above
	 * could not, because it only compared solid tokens.
	 */
	it.each([
		{ fg: 'info-fg', tint: 'info', over: 'surface' },
		{ fg: 'info-fg', tint: 'info', over: 'bg' },
		{ fg: 'accent-fg', tint: 'accent', over: 'surface' },
		{ fg: 'attention', tint: 'attention', over: 'surface' }
	])('$fg on a 12% $tint tint over $over — a status chip', ({ fg, tint, over }) => {
		const ratio = contrast(token(fg), blend(token(tint), token(over), 0.12));
		expect(
			Number(ratio.toFixed(2)),
			`${fg} on its chip is ${ratio.toFixed(2)}:1`
		).toBeGreaterThanOrEqual(AA_TEXT);
	});

	it('computes a ratio somebody can check by hand', () => {
		// Black on white is 21:1 by definition. If this drifts the whole table is
		// measuring something else.
		expect(Math.round(contrast('#000000', '#ffffff'))).toBe(21);
	});

	it('fails when a colour is darkened below the line', () => {
		// The mockup's original muted grey, which row 32 was raised about.
		expect(contrast('#6b7574', token('bg'))).toBeLessThan(AA_TEXT);
	});
});
