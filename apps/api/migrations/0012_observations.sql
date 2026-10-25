CREATE TABLE `observations` (
	`baby_id` text NOT NULL,
	`day` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`baby_id`, `day`)
);
