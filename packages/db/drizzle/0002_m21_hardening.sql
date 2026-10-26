CREATE TYPE "public"."suppression_channel" AS ENUM('all', 'email', 'linkedin');--> statement-breakpoint
CREATE TYPE "public"."suppression_origin" AS ENUM('manual', 'unsubscribe', 'hard_bounce', 'import', 'system');--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD COLUMN IF NOT EXISTS "channel" "suppression_channel" DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD COLUMN IF NOT EXISTS "origin" "suppression_origin" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "suppression_entries" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "claimed_by" text;--> statement-breakpoint
ALTER TABLE "scheduled_actions" ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppression_ws_contact_idx" ON "suppression_entries" USING btree ("workspace_id","contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppression_ws_email_idx" ON "suppression_entries" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "suppression_contact_channel_uidx" ON "suppression_entries" USING btree ("workspace_id","contact_id","channel","scope") WHERE "deleted_at" IS NULL AND "contact_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_actions_ws_contact_idx" ON "scheduled_actions" USING btree ("workspace_id","contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_actions_lease_idx" ON "scheduled_actions" USING btree ("status","lease_expires_at");
