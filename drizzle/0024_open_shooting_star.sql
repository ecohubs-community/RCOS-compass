--- `movable-current-proposal`: a discussion names the version it is asking
--- about, instead of that being whichever version is newest.
---
--- Hand-edited to add the backfill. The column carries no foreign key on
--- purpose — `post`.`discussion_id` already references `discussion` on cascade,
--- so a constraint pointing back is a cycle, and `frozen_decision_id` on the
--- same table has been avoiding it the same way since 0001.
---
--- The backfill is exactly today's behaviour, and must stay exactly that: the
--- highest-numbered proposal in each thread, null where a thread has none. Any
--- other choice silently changes which version answers, on every existing
--- discussion, in a product whose whole claim is that the record is accurate.
ALTER TABLE `discussion` ADD `current_proposal_post_id` text;--> statement-breakpoint
UPDATE `discussion` SET `current_proposal_post_id` = (
	SELECT `post`.`id` FROM `post`
	WHERE `post`.`discussion_id` = `discussion`.`id`
		AND `post`.`kind` = 'proposal'
	ORDER BY `post`.`proposal_version` DESC
	LIMIT 1
);
