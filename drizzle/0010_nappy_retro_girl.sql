-- Visibility, and the record of having been published.
--
-- `ALTER TABLE … ADD COLUMN` deliberately, with the level enforced by triggers
-- rather than a CHECK. Adding a CHECK to an existing table needs SQLite's table
-- rebuild, and drizzle-kit generates that with `PRAGMA foreign_keys=OFF` around
-- the DROP — which is a no-op inside a transaction, and the migrator runs in
-- one. On this schema the drop cascaded and deleted every local definition
-- attached to a community artifact. The generated version passed on an empty
-- database, because there was nothing there to lose.
--
-- Every existing row becomes `member`, which is exactly today's effective
-- behaviour: nothing a community owns becomes readable by upgrading.

CREATE TABLE `transparency_exception` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`audience` text NOT NULL,
	`justification` text NOT NULL,
	`decision_id` text,
	`expires_at` integer NOT NULL,
	`expired_at` integer,
	`renews_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "transparency_exception_subject_ck" CHECK("transparency_exception"."subject_type" in ('definition', 'decision', 'document', 'artifact')),
	CONSTRAINT "transparency_exception_audience_ck" CHECK("transparency_exception"."audience" in ('stewards')),
	CONSTRAINT "transparency_exception_justified_ck" CHECK(length(trim("transparency_exception"."justification")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transparency_exception_live_idx` ON `transparency_exception` (`community_id`,`subject_type`,`subject_id`) WHERE "transparency_exception"."expired_at" is null;--> statement-breakpoint
CREATE INDEX `transparency_exception_expiry_idx` ON `transparency_exception` (`expires_at`);--> statement-breakpoint
ALTER TABLE `community_artifact` ADD `visibility` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `community_artifact` ADD `first_published_at` integer;--> statement-breakpoint
ALTER TABLE `definition` ADD `visibility` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `definition` ADD `first_published_at` integer;--> statement-breakpoint
ALTER TABLE `decision` ADD `visibility` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `decision` ADD `first_published_at` integer;--> statement-breakpoint
ALTER TABLE `document` ADD `visibility` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `document` ADD `first_published_at` integer;;--> statement-breakpoint
CREATE TRIGGER `definition_visibility_ins` BEFORE INSERT ON `definition`
WHEN NEW.`visibility` NOT IN ('member', 'world', 'restricted')
BEGIN SELECT RAISE(ABORT, 'visibility must be member, world or restricted'); END;--> statement-breakpoint
CREATE TRIGGER `definition_visibility_upd` BEFORE UPDATE OF `visibility` ON `definition`
WHEN NEW.`visibility` NOT IN ('member', 'world', 'restricted')
BEGIN SELECT RAISE(ABORT, 'visibility must be member, world or restricted'); END;--> statement-breakpoint
CREATE TRIGGER `decision_visibility_ins` BEFORE INSERT ON `decision`
WHEN NEW.`visibility` NOT IN ('member', 'world', 'restricted')
BEGIN SELECT RAISE(ABORT, 'visibility must be member, world or restricted'); END;--> statement-breakpoint
CREATE TRIGGER `decision_visibility_upd` BEFORE UPDATE OF `visibility` ON `decision`
WHEN NEW.`visibility` NOT IN ('member', 'world', 'restricted')
BEGIN SELECT RAISE(ABORT, 'visibility must be member, world or restricted'); END;--> statement-breakpoint
CREATE TRIGGER `document_visibility_ins` BEFORE INSERT ON `document`
WHEN NEW.`visibility` NOT IN ('member', 'world', 'restricted')
BEGIN SELECT RAISE(ABORT, 'visibility must be member, world or restricted'); END;--> statement-breakpoint
CREATE TRIGGER `document_visibility_upd` BEFORE UPDATE OF `visibility` ON `document`
WHEN NEW.`visibility` NOT IN ('member', 'world', 'restricted')
BEGIN SELECT RAISE(ABORT, 'visibility must be member, world or restricted'); END;--> statement-breakpoint
CREATE TRIGGER `community_artifact_visibility_ins` BEFORE INSERT ON `community_artifact`
WHEN NEW.`visibility` NOT IN ('member', 'world', 'restricted')
BEGIN SELECT RAISE(ABORT, 'visibility must be member, world or restricted'); END;--> statement-breakpoint
CREATE TRIGGER `community_artifact_visibility_upd` BEFORE UPDATE OF `visibility` ON `community_artifact`
WHEN NEW.`visibility` NOT IN ('member', 'world', 'restricted')
BEGIN SELECT RAISE(ABORT, 'visibility must be member, world or restricted'); END;
