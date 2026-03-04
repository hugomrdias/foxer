CREATE TYPE "transaction_type" AS ENUM('legacy', 'eip1559', 'eip2930', 'eip4844', 'eip7702');--> statement-breakpoint
CREATE TABLE "datasets" (
	"data_set_id" bigint PRIMARY KEY,
	"provider_id" bigint NOT NULL,
	"pdp_rail_id" bigint NOT NULL,
	"cache_miss_rail_id" bigint NOT NULL,
	"cdn_rail_id" bigint NOT NULL,
	"payer" varchar(42) NOT NULL,
	"service_provider" varchar(42) NOT NULL,
	"payee" varchar(42) NOT NULL,
	"metadata" json,
	"block_number" bigint NOT NULL,
	"listener_addr" varchar(42),
	"created_at" bigint,
	"updated_at" bigint
);
--> statement-breakpoint
CREATE TABLE "pieces" (
	"id" bigint,
	"dataset_id" bigint,
	"address" varchar(42) NOT NULL,
	"cid" text NOT NULL,
	"block_number" bigint NOT NULL,
	CONSTRAINT "pieces_pkey" PRIMARY KEY("dataset_id","id")
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"provider_id" bigint PRIMARY KEY,
	"service_provider" varchar(42) NOT NULL,
	"payee" varchar(42) NOT NULL,
	"description" text,
	"name" varchar(128),
	"service_url" varchar(256),
	"min_piece_size_in_bytes" bigint,
	"max_piece_size_in_bytes" bigint,
	"storage_price_per_tib_per_day" bigint,
	"min_proving_period_in_epochs" bigint,
	"location" varchar(128),
	"payment_token_address" varchar(42),
	"product_type" integer,
	"created_at" bigint,
	"updated_at" bigint,
	"block_number" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"number" bigint PRIMARY KEY,
	"timestamp" bigint NOT NULL,
	"hash" bytea NOT NULL,
	"parent_hash" bytea NOT NULL,
	"logs_bloom" bytea NOT NULL,
	"miner" varchar(42) NOT NULL,
	"gas_used" numeric(78,0) NOT NULL,
	"gas_limit" numeric(78,0) NOT NULL,
	"base_fee_per_gas" numeric(78,0),
	"nonce" bytea NOT NULL,
	"mix_hash" bytea NOT NULL,
	"state_root" bytea NOT NULL,
	"receipts_root" bytea NOT NULL,
	"transactions_root" bytea NOT NULL,
	"sha3_uncles" bytea NOT NULL,
	"size" numeric(78,0) NOT NULL,
	"difficulty" numeric(78,0) NOT NULL,
	"total_difficulty" numeric(78,0),
	"extra_data" bytea NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"hash" bytea PRIMARY KEY,
	"block_number" bigint NOT NULL,
	"transaction_index" integer NOT NULL,
	"block_hash" bytea NOT NULL,
	"from" varchar(42) NOT NULL,
	"to" varchar(42),
	"input" bytea NOT NULL,
	"value" numeric(78,0) NOT NULL,
	"nonce" integer NOT NULL,
	"r" bytea NOT NULL,
	"s" bytea NOT NULL,
	"v" numeric(78,0) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"gas" numeric(78,0) NOT NULL,
	"gas_price" numeric(78,0),
	"max_fee_per_gas" numeric(78,0),
	"max_priority_fee_per_gas" numeric(78,0),
	"access_list" jsonb
);
--> statement-breakpoint
CREATE INDEX "transactions_block_number_index" ON "transactions" ("block_number");--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_block_fk" FOREIGN KEY ("block_number") REFERENCES "blocks"("number") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pieces" ADD CONSTRAINT "datasets_block_fk" FOREIGN KEY ("block_number") REFERENCES "blocks"("number") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "providers" ADD CONSTRAINT "datasets_block_fk" FOREIGN KEY ("block_number") REFERENCES "blocks"("number") ON DELETE CASCADE;