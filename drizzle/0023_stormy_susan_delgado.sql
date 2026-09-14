--- `notifications-page`: notification text built from params when shown, a
--- member's email choices, and the last known compliance claim.
---
--- Hand-edited once: the weekly digest is replaced by an hourly per-member
--- `digest` job, so a pending `weekly-digest` row would otherwise run a week
--- later against a handler that no longer exists.
ALTER TABLE `community` ADD `claim_compliant` integer;--> statement-breakpoint
ALTER TABLE `membership` ADD `email_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `membership` ADD `digest_day` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `membership` ADD `last_digest_at` integer;--> statement-breakpoint
ALTER TABLE `notification` ADD `params` text;--> statement-breakpoint
DELETE FROM `job` WHERE `kind` = 'weekly-digest' AND `status` = 'pending';
