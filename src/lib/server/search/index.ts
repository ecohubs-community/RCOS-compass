import { getDb, type Db } from '../db/index.js';
import { fts5SearchIndex } from './fts5.js';
import type { SearchIndex } from './types.js';

export * from './types.js';
export { termsOf } from './stop-words.js';

let override: SearchIndex | null = null;

/** Test seam. Application code never calls this. */
export function setSearchIndexForTests(index: SearchIndex | null): void {
	override = index;
}

/**
 * The index, for callers that should not know what it is.
 *
 * One implementation today. When there is a second, this is the only line that
 * chooses between them, which is the whole reason the interface exists.
 */
export function getSearchIndex(db?: Db): SearchIndex {
	return override ?? fts5SearchIndex(db ?? getDb());
}
