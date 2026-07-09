CREATE TABLE "blocks" (
	"number" bigint PRIMARY KEY,
	"hash" bytea NOT NULL,
	"is_null_round" boolean DEFAULT false NOT NULL,
	"parent_hash" bytea NOT NULL,
	"timestamp" bigint NOT NULL,
	"miner" bytea NOT NULL,
	"gas_used" bigint NOT NULL,
	"gas_limit" bigint NOT NULL,
	"base_fee_per_gas" bigint,
	"size" bigint NOT NULL,
	"state_root" bytea NOT NULL,
	"receipts_root" bytea NOT NULL,
	"transactions_root" bytea NOT NULL,
	"extra_data" bytea NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"block_number" bigint,
	"log_index" integer,
	"transaction_index" integer NOT NULL,
	"address" bytea NOT NULL,
	"topic0" bytea,
	"topic1" bytea,
	"topic2" bytea,
	"topic3" bytea,
	"data" bytea NOT NULL,
	CONSTRAINT "logs_block_number_log_index_pk" PRIMARY KEY("block_number","log_index")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"hash" bytea PRIMARY KEY,
	"block_number" bigint NOT NULL,
	"transaction_index" integer NOT NULL,
	"from" bytea NOT NULL,
	"to" bytea,
	"input" bytea NOT NULL,
	"value" numeric(78,0) NOT NULL,
	"nonce" integer NOT NULL,
	"gas" bigint NOT NULL,
	"gas_price" numeric(78,0),
	"max_fee_per_gas" numeric(78,0),
	"max_priority_fee_per_gas" numeric(78,0),
	"type" smallint NOT NULL,
	"v" numeric(78,0),
	"r" bytea,
	"s" bytea,
	"access_list" jsonb,
	"status" integer,
	"receipt_gas_used" bigint,
	"cumulative_gas_used" bigint,
	"effective_gas_price" numeric(78,0),
	"contract_address" bytea
);
--> statement-breakpoint
CREATE INDEX "blocks_hash_index" ON "blocks" ("hash");--> statement-breakpoint
CREATE INDEX "logs_address_block_number_index" ON "logs" ("address","block_number");--> statement-breakpoint
CREATE INDEX "logs_topic0_block_number_index" ON "logs" ("topic0","block_number");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_block_number_index_unique" ON "transactions" ("block_number","transaction_index");