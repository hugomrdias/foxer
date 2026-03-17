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
	"size" bigint,
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
CREATE TABLE "sessionKeyPermissions" (
	"signer" varchar(42),
	"permission" varchar(66),
	"expiry" bigint,
	CONSTRAINT "sessionKeyPermissions_pkey" PRIMARY KEY("signer","permission")
);
--> statement-breakpoint
CREATE TABLE "sessionKeys" (
	"signer" varchar(42) PRIMARY KEY,
	"identity" varchar(42) NOT NULL,
	"origin" text NOT NULL,
	"block_number" bigint NOT NULL,
	"created_at" bigint,
	"updated_at" bigint
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"number" bigint PRIMARY KEY,
	"timestamp" bigint NOT NULL,
	"hash" varchar(66) NOT NULL,
	"parent_hash" varchar(66) NOT NULL,
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
	"hash" varchar(66) PRIMARY KEY,
	"block_number" bigint NOT NULL,
	"transaction_index" integer NOT NULL,
	"block_hash" varchar(66) NOT NULL,
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
CREATE INDEX "datasets_block_number_index" ON "datasets" ("block_number");--> statement-breakpoint
CREATE INDEX "pieces_block_number_index" ON "pieces" ("block_number");--> statement-breakpoint
CREATE INDEX "providers_block_number_index" ON "providers" ("block_number");--> statement-breakpoint
CREATE INDEX "sessionKeys_identity_index" ON "sessionKeys" ("identity");--> statement-breakpoint
CREATE INDEX "sessionKeys_block_number_index" ON "sessionKeys" ("block_number");--> statement-breakpoint
CREATE INDEX "transactions_block_number_index" ON "transactions" ("block_number");--> statement-breakpoint
CREATE INDEX "transactions_to_index" ON "transactions" ("to");--> statement-breakpoint
CREATE INDEX "transactions_to_block_number_index" ON "transactions" ("to","block_number");--> statement-breakpoint
ALTER TABLE "sessionKeyPermissions" ADD CONSTRAINT "sessionKeyPermissions_signer_fk" FOREIGN KEY ("signer") REFERENCES "sessionKeys"("signer") ON DELETE CASCADE;