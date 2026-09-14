--- A scan's own token. `stillLive` matched a scan by member and content
--- generation, so a member continuing their own stalled scan left the old job
--- chain live beside the new one — two chains, charged twice. Every claim now
--- writes a fresh id that its jobs carry.
ALTER TABLE `document` ADD `scan_claim` text;