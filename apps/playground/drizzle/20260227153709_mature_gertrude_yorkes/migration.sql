ALTER TABLE "datasets" ADD COLUMN "listener_addr" varchar(42);--> statement-breakpoint
ALTER TABLE "datasets" ADD COLUMN "created_at" bigint;--> statement-breakpoint
ALTER TABLE "datasets" ADD COLUMN "updated_at" bigint;--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "type_hex";--> statement-breakpoint
ALTER TABLE "blocks" ALTER COLUMN "nonce" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "blocks" ALTER COLUMN "mix_hash" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "blocks" ALTER COLUMN "sha3_uncles" SET NOT NULL;