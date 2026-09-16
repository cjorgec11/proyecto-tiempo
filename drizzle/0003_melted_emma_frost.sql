CREATE TABLE `route_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`distance` real NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `route_history_created` ON `route_history` (`created_at`);--> statement-breakpoint
CREATE INDEX `route_history_user_created` ON `route_history` (`user_id`,`created_at`);