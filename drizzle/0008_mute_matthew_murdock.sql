-- The generated copy step selected `quote` out of a table that predates the
-- column; rows from before it (none are deployed anywhere) carry an empty
-- quote rather than blocking the migration.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`passage_id` text,
	`quote` text NOT NULL,
	`community_standard_id` text NOT NULL,
	`clause_key` text NOT NULL,
	`state` text NOT NULL,
	`confidence` integer,
	`suggested_by` text NOT NULL,
	`confirmed_by` text,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`passage_id`) REFERENCES `passage`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`community_standard_id`) REFERENCES `community_standard`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`confirmed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "evidence_state_ck" CHECK("__new_evidence"."state" in ('suggested', 'confirmed', 'dismissed', 'stale')),
	CONSTRAINT "evidence_source_ck" CHECK("__new_evidence"."suggested_by" in ('ai', 'human')),
	CONSTRAINT "evidence_settled_ck" CHECK(("__new_evidence"."state" = 'suggested' and "__new_evidence"."confirmed_by" is null and "__new_evidence"."confirmed_at" is null)
				or ("__new_evidence"."state" in ('confirmed', 'dismissed') and "__new_evidence"."confirmed_by" is not null and "__new_evidence"."confirmed_at" is not null)
				or ("__new_evidence"."state" = 'stale'))
);
--> statement-breakpoint
INSERT INTO `__new_evidence`("id", "community_id", "passage_id", "quote", "community_standard_id", "clause_key", "state", "confidence", "suggested_by", "confirmed_by", "confirmed_at", "created_at") SELECT "id", "community_id", "passage_id", '' AS "quote", "community_standard_id", "clause_key", "state", "confidence", "suggested_by", "confirmed_by", "confirmed_at", "created_at" FROM `evidence`;--> statement-breakpoint
DROP TABLE `evidence`;--> statement-breakpoint
ALTER TABLE `__new_evidence` RENAME TO `evidence`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_pair_idx` ON `evidence` (`community_id`,`passage_id`,`clause_key`);--> statement-breakpoint
CREATE INDEX `evidence_clause_idx` ON `evidence` (`community_id`,`clause_key`,`state`);