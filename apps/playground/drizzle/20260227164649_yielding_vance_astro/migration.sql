ALTER TABLE "providers" ADD COLUMN "service_url" varchar(256);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "min_piece_size_in_bytes" bigint;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "storage_price_per_tib_per_day" bigint;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "min_proving_period_in_epochs" bigint;--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "location" varchar(128);--> statement-breakpoint
ALTER TABLE "providers" ADD COLUMN "payment_token_address" varchar(42);--> statement-breakpoint
ALTER TABLE "providers" ALTER COLUMN "name" SET DATA TYPE varchar(128) USING "name"::varchar(128);