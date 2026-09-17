DROP INDEX `app_users_email`;--> statement-breakpoint
CREATE UNIQUE INDEX `app_users_email` ON `app_users` (`email`);