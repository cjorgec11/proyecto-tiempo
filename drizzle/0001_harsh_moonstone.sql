CREATE TABLE `feedback_votes` (
	`feedback_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`feedback_id`, `user_id`),
	FOREIGN KEY (`feedback_id`) REFERENCES `feedback`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `feedback` ADD `public` integer DEFAULT 0 NOT NULL;