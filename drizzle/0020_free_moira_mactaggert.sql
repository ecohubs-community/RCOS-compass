--- `document-mapping-workspace`: the scan as a job, reasons and excerpts on
--- suggestions, and earlier files kept as versions.
---
--- Hand-edited in three ways, each for a reason worth keeping:
---
--- 1. The added reference columns carry their `ON DELETE SET NULL` explicitly.
---    drizzle-kit emits `ADD ... REFERENCES t(id)` with no action, which in
---    SQLite means NO ACTION — deleting a document that any evidence pointed at
---    would then *fail* instead of leaving the claim stale and readable.
--- 2. `scan_status` is checked by trigger, not CHECK: a checked column rebuilds
---    `document`, and the rebuild's DROP cascades into every child table inside
---    the migrator's transaction (the trap 0010 and 0017 document).
--- 3. Backfills: evidence learns its document from its passage, and a document a
---    model already read is `stopped` rather than presented as never scanned.
CREATE TABLE `document_file_version` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`community_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_key` text NOT NULL,
	`uploaded_by` text,
	`uploaded_at` integer NOT NULL,
	`superseded_by` text,
	`superseded_at` integer NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`superseded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `document_file_version_document_idx` ON `document_file_version` (`document_id`,`superseded_at`);--> statement-breakpoint
CREATE INDEX `document_file_version_community_idx` ON `document_file_version` (`community_id`);--> statement-breakpoint
ALTER TABLE `document` ADD `scan_status` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `document` ADD `scan_detail` text;--> statement-breakpoint
ALTER TABLE `document` ADD `scan_actor` text REFERENCES `user`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `document` ADD `scan_heartbeat_at` integer;--> statement-breakpoint
ALTER TABLE `document` ADD `content_generation` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `document` ADD `mapping_done_at` integer;--> statement-breakpoint
ALTER TABLE `document` ADD `mapping_done_by` text REFERENCES `user`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `evidence` ADD `document_id` text REFERENCES `document`(`id`) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `evidence` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `evidence` ADD `excerpt_start` integer;--> statement-breakpoint
ALTER TABLE `evidence` ADD `excerpt_end` integer;--> statement-breakpoint
ALTER TABLE `passage` ADD `scanned_at` integer;--> statement-breakpoint
CREATE TRIGGER `document_scan_status_ins` BEFORE INSERT ON `document`
WHEN NEW.`scan_status` NOT IN ('none', 'queued', 'running', 'stopped', 'complete')
BEGIN SELECT RAISE(ABORT, 'scan_status must be none, queued, running, stopped or complete'); END;--> statement-breakpoint
CREATE TRIGGER `document_scan_status_upd` BEFORE UPDATE OF `scan_status` ON `document`
WHEN NEW.`scan_status` NOT IN ('none', 'queued', 'running', 'stopped', 'complete')
BEGIN SELECT RAISE(ABORT, 'scan_status must be none, queued, running, stopped or complete'); END;--> statement-breakpoint
UPDATE `evidence` SET `document_id` = (
	SELECT `passage`.`document_id` FROM `passage` WHERE `passage`.`id` = `evidence`.`passage_id`
) WHERE `passage_id` IS NOT NULL;--> statement-breakpoint
UPDATE `passage` SET `scanned_at` = (
	SELECT MIN(`evidence`.`created_at`) FROM `evidence`
	WHERE `evidence`.`passage_id` = `passage`.`id` AND `evidence`.`suggested_by` = 'ai'
) WHERE EXISTS (
	SELECT 1 FROM `evidence`
	WHERE `evidence`.`passage_id` = `passage`.`id` AND `evidence`.`suggested_by` = 'ai'
);--> statement-breakpoint
UPDATE `document` SET
	`scan_status` = 'stopped',
	`scan_detail` = 'This document was scanned before Compass recorded progress. Continue the scan to make sure nothing was missed.'
WHERE EXISTS (
	SELECT 1 FROM `evidence`
	WHERE `evidence`.`document_id` = `document`.`id`
		AND `evidence`.`suggested_by` = 'ai'
		AND `evidence`.`state` <> 'stale'
);
