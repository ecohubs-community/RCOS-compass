CREATE TABLE `job` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`run_after` integer NOT NULL,
	`locked_until` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 5 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `job_claim_idx` ON `job` (`status`,`run_after`);--> statement-breakpoint
CREATE INDEX `job_kind_idx` ON `job` (`kind`);