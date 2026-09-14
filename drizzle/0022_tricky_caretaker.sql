--- local-time: where a person reads times from (IANA zone), null until their
--- browser first reports one. Erased with the account.
ALTER TABLE `user` ADD `time_zone` text;