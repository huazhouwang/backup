CREATE TABLE `summary_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`daily` integer DEFAULT true NOT NULL,
	`weekly` integer DEFAULT true NOT NULL,
	`sent_on` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
