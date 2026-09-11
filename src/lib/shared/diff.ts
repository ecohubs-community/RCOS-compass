/**
 * What changed between two versions of a proposal.
 *
 * Word-level rather than character-level, because governance prose is read as
 * words and a character diff of "three months" → "two months" highlights the
 * letters they have in common. Here rather than on the server because the
 * comparison is a rendering concern and a component may not import from the
 * server (`docs/02-component-guidelines.md` §4).
 *
 * A plain longest-common-subsequence. The texts are one definition long — a few
 * hundred words at the outside — so the quadratic table is a rounding error, and
 * anything cleverer would be harder to be sure of.
 */

export type DiffPart = { kind: 'same' | 'added' | 'removed'; text: string };

/** Words, keeping the whitespace that follows each one so joins round-trip. */
function words(text: string): string[] {
	return text.match(/\S+\s*/g) ?? [];
}

export function diffWords(before: string, after: string): DiffPart[] {
	const a = words(before);
	const b = words(after);

	// table[i][j] = length of the longest common subsequence of a[i…] and b[j…]
	const table: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0)
	);
	for (let i = a.length - 1; i >= 0; i -= 1) {
		for (let j = b.length - 1; j >= 0; j -= 1) {
			table[i]![j] =
				a[i]!.trim() === b[j]!.trim()
					? table[i + 1]![j + 1]! + 1
					: Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
		}
	}

	const parts: DiffPart[] = [];
	const push = (kind: DiffPart['kind'], text: string) => {
		const last = parts.at(-1);
		// Runs are merged so the rendering marks a changed phrase once rather than
		// putting a box around every word in it.
		if (last?.kind === kind) last.text += text;
		else parts.push({ kind, text });
	};

	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i]!.trim() === b[j]!.trim()) {
			push('same', b[j]!);
			i += 1;
			j += 1;
		} else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
			push('removed', a[i]!);
			i += 1;
		} else {
			push('added', b[j]!);
			j += 1;
		}
	}
	while (i < a.length) push('removed', a[i++]!);
	while (j < b.length) push('added', b[j++]!);

	return parts;
}
