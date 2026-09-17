CREATE TABLE `account_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`purpose` text NOT NULL,
	`expires` integer NOT NULL,
	`verifier` text
);
--> statement-breakpoint
CREATE TABLE `user_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `app_users` ADD `password` text;--> statement-breakpoint
ALTER TABLE `app_users` ADD `verified` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `app_users` ADD `google_sub` text;--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_google_sub_unique` ON `app_users` (`google_sub`);--> statement-breakpoint
CREATE INDEX `app_users_email` ON `app_users` (`email`);