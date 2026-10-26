ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "step_id" uuid;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "sender_identity_id" uuid;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "blocked_reasons" jsonb;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "cancel_reason" text;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "policy_version" text;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "requires_approval" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "last_error" text;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "reserved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_actions_ws_status_idx" ON "scheduled_actions" USING btree ("workspace_id","status","due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_actions_enrollment_idx" ON "scheduled_actions" USING btree ("enrollment_id","status");
