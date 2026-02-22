CREATE TYPE "transaction_type" AS ENUM('legacy', 'eip1559', 'eip2930', 'eip4844', 'eip7702');--> statement-breakpoint
CREATE TABLE "blocks" (
	"number" bigint PRIMARY KEY,
	"timestamp" bigint NOT NULL,
	"hash" varchar(66) NOT NULL,
	"parent_hash" varchar(66) NOT NULL,
	"logs_bloom" varchar(514) NOT NULL,
	"miner" varchar(42) NOT NULL,
	"gas_used" numeric(78,0) NOT NULL,
	"gas_limit" numeric(78,0) NOT NULL,
	"base_fee_per_gas" numeric(78,0),
	"nonce" varchar(18) NOT NULL,
	"mix_hash" varchar(66) NOT NULL,
	"state_root" varchar(66) NOT NULL,
	"receipts_root" varchar(66) NOT NULL,
	"transactions_root" varchar(66) NOT NULL,
	"sha3_uncles" varchar(66) NOT NULL,
	"size" numeric(78,0) NOT NULL,
	"difficulty" numeric(78,0) NOT NULL,
	"total_difficulty" numeric(78,0),
	"extra_data" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"hash" varchar(66) PRIMARY KEY,
	"block_number" bigint NOT NULL,
	"transaction_index" integer NOT NULL,
	"block_hash" varchar(66) NOT NULL,
	"from" varchar(42) NOT NULL,
	"to" varchar(42),
	"input" text NOT NULL,
	"value" numeric(78,0) NOT NULL,
	"nonce" integer NOT NULL,
	"r" varchar(66) NOT NULL,
	"s" varchar(66) NOT NULL,
	"v" numeric(78,0) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"type_hex" varchar(66),
	"gas" numeric(78,0) NOT NULL,
	"gas_price" numeric(78,0),
	"max_fee_per_gas" numeric(78,0),
	"max_priority_fee_per_gas" numeric(78,0),
	"access_list" jsonb
);
--> statement-breakpoint
CREATE INDEX "transactions_block_number_index" ON "transactions" ("block_number");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_block_fk" FOREIGN KEY ("block_number") REFERENCES "blocks"("number") ON DELETE CASCADE;