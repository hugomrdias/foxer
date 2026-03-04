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
CREATE INDEX "sessionKeys_identity_index" ON "sessionKeys" ("identity");--> statement-breakpoint
ALTER TABLE "sessionKeyPermissions" ADD CONSTRAINT "sessionKeyPermissions_signer_fk" FOREIGN KEY ("signer") REFERENCES "sessionKeys"("signer") ON DELETE CASCADE;