CREATE TABLE `path_override` (
	`community_id` text NOT NULL,
	`section_key` text NOT NULL,
	`position` integer NOT NULL,
	`weights_id_at_placement` text,
	`placed_by` text,
	`placed_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`weights_id_at_placement`) REFERENCES `path_weights`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`placed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "path_override_position_ck" CHECK("path_override"."position" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `path_override_idx` ON `path_override` (`community_id`,`section_key`);--> statement-breakpoint
CREATE TABLE `path_weights` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`dependency` integer NOT NULL,
	`severity` integer NOT NULL,
	`risk` integer NOT NULL,
	`attention` integer NOT NULL,
	`is_default` integer DEFAULT true NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`changed_by` text,
	`changed_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "path_weights_range_ck" CHECK("path_weights"."dependency" >= 0 and "path_weights"."severity" >= 0 and "path_weights"."risk" >= 0 and "path_weights"."attention" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `path_weights_active_idx` ON `path_weights` (`community_id`) WHERE "path_weights"."active" = 1;--> statement-breakpoint
CREATE INDEX `path_weights_history_idx` ON `path_weights` (`community_id`,`changed_at`);--> statement-breakpoint
CREATE TABLE `risk_profile` (
	`community_id` text PRIMARY KEY NOT NULL,
	`holds_land` integer,
	`shared_money` integer,
	`children_on_site` integer,
	`founder_owner` integer,
	`meets` text,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "risk_profile_meets_ck" CHECK("risk_profile"."meets" is null or "risk_profile"."meets" in ('in_person', 'online', 'both'))
);
--> statement-breakpoint
-- The full-text index. Hand-written because drizzle cannot express a virtual
-- table, and because `docs/00-architecture.md` §5 names FTS5 as the one place
-- raw SQL is expected — living behind an interface, with one file per engine.
--
-- `community_id` is UNINDEXED but stored, so it is a real filter inside the
-- query rather than something applied to the rows that come back. A search that
-- fetches across communities and filters afterwards is one refactor away from
-- not filtering.
--
-- Clause text is deliberately absent: it is identical for every community, and
-- a per-tenant copy of non-tenant data inside the structure whose whole
-- discipline is tenant isolation is the leak that structure exists to prevent.
CREATE VIRTUAL TABLE `search_document` USING fts5(
	community_id UNINDEXED,
	kind UNINDEXED,
	subject_id UNINDEXED,
	ref UNINDEXED,
	title,
	body,
	tokenize = 'unicode61 remove_diacritics 2'
);
