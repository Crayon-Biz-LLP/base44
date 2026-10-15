ALTER TABLE "tenants" ADD COLUMN "access_code" text;--> statement-breakpoint
ALTER TABLE "workflows" ADD COLUMN "status" text DEFAULT 'published' NOT NULL;