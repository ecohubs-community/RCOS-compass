import { v7 as uuidv7 } from 'uuid';

/**
 * Application-generated UUIDv7 identifiers.
 *
 * docs/00-architecture.md §5: never AUTOINCREMENT. UUIDv7 sorts chronologically,
 * is portable to Postgres unchanged, is safe to expose in a URL, and does not
 * leak how many rows a table holds.
 */
export type Id = string;

let generator: () => string = uuidv7;

export function newId(): Id {
	return generator();
}

/**
 * Test seam (docs/06-testing-strategy.md §2.1): ids are seeded in tests so that
 * failures are reproducible and diffs are readable.
 */
export function setIdGeneratorForTests(fn: (() => string) | null): void {
	generator = fn ?? uuidv7;
}

/** A deterministic, still chronologically-sortable generator for tests. */
export function seededIdGenerator(prefix = '0000'): () => string {
	let n = 0;
	return () => {
		n += 1;
		const counter = n.toString(16).padStart(12, '0');
		return `${prefix}0000-0000-7000-8000-${counter}`;
	};
}
