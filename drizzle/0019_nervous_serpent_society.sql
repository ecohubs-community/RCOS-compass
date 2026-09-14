--- `document-paragraphs`: passages become paragraphs and headings, documents
--- record which reader produced them, and no document may be world-visible.
---
--- Rebuilding `passage` to add `kind` with its CHECK. SQLite cannot add a
--- checked column in place, so drizzle emits the twelve-step rebuild: create,
--- copy, DROP TABLE, rename. `PRAGMA foreign_keys=OFF` guards that — and the
--- pragma is a **no-op inside a transaction**, which is where the migrator runs
--- every statement below. The DROP therefore fires ON DELETE SET NULL into
--- `evidence.passage_id` and `definition_source.passage_id`, quietly turning
--- every claim stale-shaped. The references are carried across by hand, the
--- same way 0017 carried consent responses.
---
--- Hand-edited twice more: the generated copy selected `kind` from a table
--- that has no such column (it is new, so every existing row is 'paragraph'),
--- and the data fix at the bottom belongs to this change's spec — a document
--- must never be world-visible, so any that is becomes member-visible again.
ALTER TABLE `document` ADD `extractor_version` integer;--> statement-breakpoint
CREATE TABLE `__carry_evidence_passage` (`id` text, `passage_id` text);--> statement-breakpoint
INSERT INTO `__carry_evidence_passage` SELECT `id`, `passage_id` FROM `evidence`;--> statement-breakpoint
CREATE TABLE `__carry_definition_source_passage` (`definition_id` text, `passage_id` text);--> statement-breakpoint
INSERT INTO `__carry_definition_source_passage` SELECT `definition_id`, `passage_id` FROM `definition_source`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_passage` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`page` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`kind` text DEFAULT 'paragraph' NOT NULL,
	`text` text NOT NULL,
	`text_hash` text NOT NULL,
	`bbox` text,
	FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "passage_kind_ck" CHECK("__new_passage"."kind" in ('heading', 'paragraph'))
);
--> statement-breakpoint
INSERT INTO `__new_passage`("id", "document_id", "page", "ordinal", "kind", "text", "text_hash", "bbox") SELECT "id", "document_id", "page", "ordinal", 'paragraph', "text", "text_hash", "bbox" FROM `passage`;--> statement-breakpoint
DROP TABLE `passage`;--> statement-breakpoint
ALTER TABLE `__new_passage` RENAME TO `passage`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `passage_document_idx` ON `passage` (`document_id`,`page`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `passage_position_idx` ON `passage` (`document_id`,`page`,`ordinal`);--> statement-breakpoint
UPDATE `evidence` SET `passage_id` = (SELECT c.`passage_id` FROM `__carry_evidence_passage` c WHERE c.`id` = `evidence`.`id`);--> statement-breakpoint
UPDATE `definition_source` SET `passage_id` = (SELECT c.`passage_id` FROM `__carry_definition_source_passage` c WHERE c.`definition_id` = `definition_source`.`definition_id`);--> statement-breakpoint
DROP TABLE `__carry_evidence_passage`;--> statement-breakpoint
DROP TABLE `__carry_definition_source_passage`;--> statement-breakpoint
UPDATE `document` SET `visibility` = 'member' WHERE `visibility` = 'world';
