CREATE TABLE "providers" (
	"provider_id" bigint PRIMARY KEY,
	"service_provider" varchar(42) NOT NULL,
	"payee" varchar(42) NOT NULL,
	"description" text,
	"name" text,
	"created_at" bigint,
	"updated_at" bigint,
	"block_number" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "datasets_block_fk" FOREIGN KEY ("block_number") REFERENCES "blocks"("number") ON DELETE CASCADE;