CREATE TABLE `ai_call` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`actor_id` text,
	`task` text NOT NULL,
	`model` text NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`ms` integer DEFAULT 0 NOT NULL,
	`input_sha256` text NOT NULL,
	`ok` integer NOT NULL,
	`detail` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_call_community_idx` ON `ai_call` (`community_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`community_id` text NOT NULL,
	`actor_id` text,
	`period_day` text NOT NULL,
	`period_month` text NOT NULL,
	`tasks` integer DEFAULT 0 NOT NULL,
	`tokens` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_usage_idx` ON `ai_usage` (`community_id`,`actor_id`,`period_day`,`period_month`);--> statement-breakpoint
CREATE TABLE `definition_source` (
	`definition_id` text PRIMARY KEY NOT NULL,
	`evidence_id` text,
	`passage_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`definition_id`) REFERENCES `definition`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`evidence_id`) REFERENCES `evidence`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`passage_id`) REFERENCES `passage`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `definition_source_evidence_idx` ON `definition_source` (`evidence_id`);--> statement-breakpoint
CREATE TABLE `document` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_key` text NOT NULL,
	`status` text NOT NULL,
	`status_detail` text,
	`pages_extracted` integer,
	`pages_total` integer,
	`uploaded_by` text,
	`uploaded_at` integer NOT NULL,
	`extracted_at` integer,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "document_status_ck" CHECK("document"."status" in ('uploaded', 'extracting', 'extracted', 'reference_only', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `document_community_idx` ON `document` (`community_id`,`uploaded_at`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`community_id` text NOT NULL,
	`passage_id` text NOT NULL,
	`community_standard_id` text NOT NULL,
	`clause_key` text NOT NULL,
	`state` text NOT NULL,
	`confidence` integer,
	`suggested_by` text NOT NULL,
	`confirmed_by` text,
	`confirmed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`community_id`) REFERENCES `community`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`passage_id`) REFERENCES `passage`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`community_standard_id`) REFERENCES `community_standard`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`confirmed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "evidence_state_ck" CHECK("evidence"."state" in ('suggested', 'confirmed', 'dismissed', 'stale')),
	CONSTRAINT "evidence_source_ck" CHECK("evidence"."suggested_by" in ('ai', 'human')),
	CONSTRAINT "evidence_confirmed_ck" CHECK(("evidence"."state" = 'confirmed') = ("evidence"."confirmed_by" is not null and "evidence"."confirmed_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_pair_idx` ON `evidence` (`community_id`,`passage_id`,`clause_key`);--> statement-breakpoint
CREATE INDEX `evidence_clause_idx` ON `evidence` (`community_id`,`clause_key`,`state`);--> statement-breakpoint
CREATE TABLE `passage` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`page` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`text` text NOT NULL,
	`text_hash` text NOT NULL,
	`bbox` text,
	FOREIGN KEY (`document_id`) REFERENCES `document`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passage_document_idx` ON `passage` (`document_id`,`page`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `passage_position_idx` ON `passage` (`document_id`,`page`,`ordinal`);