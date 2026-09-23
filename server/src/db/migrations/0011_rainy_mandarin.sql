CREATE INDEX "pr_commits_pr_id_idx" ON "pr_commits" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "pr_files_pr_id_idx" ON "pr_files" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "findings_review_id_idx" ON "findings" USING btree ("review_id");--> statement-breakpoint
CREATE INDEX "reviews_pr_id_idx" ON "reviews" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "reviews_ws_id_idx" ON "reviews" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_runs_ws_id_idx" ON "agent_runs" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "agent_runs_pr_id_idx" ON "agent_runs" USING btree ("pr_id");--> statement-breakpoint
CREATE INDEX "agent_runs_agent_id_idx" ON "agent_runs" USING btree ("agent_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pr_status_check" CHECK ("pull_requests"."status" IN ('needs_review', 'open', 'merged', 'closed'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_severity_check" CHECK ("findings"."severity" IN ('CRITICAL', 'WARNING', 'SUGGESTION'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_category_check" CHECK ("findings"."category" IN ('bug', 'security', 'perf', 'style', 'test'));--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_status_check" CHECK ("agent_runs"."status" IS NULL OR "agent_runs"."status" IN ('running', 'done', 'failed', 'cancelled'));