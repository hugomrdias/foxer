CREATE TABLE "datasets" (
	"block_number" bigint NOT NULL,
	"id" bigint PRIMARY KEY,
	"provider_id" bigint NOT NULL,
	"pdpRailId" bigint,
	"cdnRailId" bigint,
	"cacheMissRailId" bigint,
	"payee" text,
	"storage_provider" text,
	"account_address" text NOT NULL,
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_block_fk" FOREIGN KEY ("block_number") REFERENCES "blocks"("number") ON DELETE CASCADE;