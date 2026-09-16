CREATE TABLE `admin_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `admin_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL,
	`credential` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `feedback` DROP COLUMN `notification`;