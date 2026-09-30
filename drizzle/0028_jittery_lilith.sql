ALTER TABLE `discussion` ADD `section_key` text;--> statement-breakpoint
CREATE INDEX `discussion_section_idx` ON `discussion` (`community_id`,`section_key`);