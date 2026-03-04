import { integer, pgTable, text, varchar } from 'drizzle-orm/pg-core'
import { address, bigint } from 'foxer'

export const providers = pgTable('providers', {
  providerId: bigint().primaryKey(),
  serviceProvider: address().notNull(),
  payee: address().notNull(),
  description: text(),
  name: varchar({ length: 128 }),
  serviceURL: varchar({ length: 256 }),
  minPieceSizeInBytes: bigint(),
  maxPieceSizeInBytes: bigint(),
  storagePricePerTibPerDay: bigint(),
  minProvingPeriodInEpochs: bigint(),
  location: varchar({ length: 128 }),
  paymentTokenAddress: address(),
  productType: integer(),
  createdAt: bigint(),
  updatedAt: bigint(),
  blockNumber: bigint().notNull(),
})
