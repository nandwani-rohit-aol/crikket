ALTER TABLE "bug_report_action" ADD COLUMN "source_tab_id" integer;--> statement-breakpoint
ALTER TABLE "bug_report_action" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "bug_report_log" ADD COLUMN "source_tab_id" integer;--> statement-breakpoint
ALTER TABLE "bug_report_log" ADD COLUMN "source" jsonb;--> statement-breakpoint
ALTER TABLE "bug_report_network_request" ADD COLUMN "source_tab_id" integer;--> statement-breakpoint
ALTER TABLE "bug_report_network_request" ADD COLUMN "source" jsonb;