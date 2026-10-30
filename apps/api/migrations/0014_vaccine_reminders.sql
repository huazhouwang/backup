CREATE TABLE `vaccine_reminders` (
	`user_id` text NOT NULL,
	`baby_id` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sent_on` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `baby_id`)
);
--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `time_zone` text;