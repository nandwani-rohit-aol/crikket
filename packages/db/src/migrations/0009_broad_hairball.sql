ALTER TABLE "capture_public_key" DROP CONSTRAINT "capture_public_key_organization_id_unique";--> statement-breakpoint
ALTER TABLE "capture_public_key" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "capture_public_key" ADD COLUMN "environment" text;--> statement-breakpoint
ALTER TABLE "capture_public_key" ADD COLUMN "allowed_origins" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_public_key" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_public_key" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "capture_public_key" ADD COLUMN "rotated_at" timestamp;--> statement-breakpoint
ALTER TABLE "capture_public_key" ADD COLUMN "revoked_at" timestamp;--> statement-breakpoint
UPDATE "capture_public_key"
SET
	"label" = COALESCE("label", 'legacy-' || substring("key" from 1 for 12)),
	"environment" = COALESCE("environment", 'production');--> statement-breakpoint
ALTER TABLE "capture_public_key" ALTER COLUMN "label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_public_key" ALTER COLUMN "environment" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_public_key" ADD CONSTRAINT "capture_public_key_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capture_public_key_status_idx" ON "capture_public_key" USING btree ("status");
