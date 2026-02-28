CREATE TABLE "capture_public_key" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "capture_public_key_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "capture_public_key_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "capture_public_key" ADD CONSTRAINT "capture_public_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capture_public_key_organizationId_idx" ON "capture_public_key" USING btree ("organization_id");