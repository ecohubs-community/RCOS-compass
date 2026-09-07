-- The search index learns visibility.
--
-- **An FTS5 virtual table cannot be altered.** SQLite answers `virtual tables
-- may not be altered` to `ALTER TABLE … ADD COLUMN`, so adding a column means
-- dropping and recreating — which empties the index.
--
-- That is why the release step for this version is **migrate → rebuild →
-- serve**, and why the rebuild stops being optional. An instance that migrates
-- and serves without `pnpm search:rebuild` has a working product whose search
-- silently returns nothing, and a test suite that passed. There is no way to
-- carry the rows across: the old table has no visibility to copy, and inventing
-- one per row is exactly the guess this column exists to remove.
--
-- Hand-written for the same reason the table itself was in P5: drizzle-kit does
-- not model virtual tables, so it neither generates this nor notices it.

DROP TABLE IF EXISTS `search_document`;--> statement-breakpoint
CREATE VIRTUAL TABLE `search_document` USING fts5(
	community_id UNINDEXED,
	visibility UNINDEXED,
	kind UNINDEXED,
	subject_id UNINDEXED,
	ref UNINDEXED,
	title,
	body,
	tokenize = 'unicode61 remove_diacritics 2'
);
