CREATE TABLE `terminal_agent_tombstones` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`terminal_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`agent_session_id` text,
	`definition_id` text,
	`preset_id` text,
	`label` text,
	`launch_command` text,
	`runtime` text NOT NULL,
	`started_at` integer NOT NULL,
	`exited_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `terminal_agent_tombstones_workspace_idx` ON `terminal_agent_tombstones` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `terminal_agent_tombstones_exited_at_idx` ON `terminal_agent_tombstones` (`exited_at`);