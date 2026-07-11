/** COPY signature, column order, and bounded chunk-size limits. No encoding logic. */

/** PostgreSQL binary COPY file signature. */
export const COPY_SIGNATURE = Buffer.from([
  0x50, 0x47, 0x43, 0x4f, 0x50, 0x59, 0x0a, 0xff, 0x0d, 0x0a, 0x00,
])

/** Fixed column order for `blocks` COPY ingestion. */
export const BLOCK_COPY_COLUMNS = [
  'number',
  'hash',
  'is_null_round',
  'parent_hash',
  'timestamp',
  'miner',
  'gas_used',
  'gas_limit',
  'base_fee_per_gas',
  'size',
  'state_root',
  'receipts_root',
  'transactions_root',
  'extra_data',
  'logs_bloom',
] as const

/** Fixed column order for `transactions` COPY ingestion. */
export const TRANSACTION_COPY_COLUMNS = [
  'hash',
  'block_number',
  'transaction_index',
  'from',
  'to',
  'input',
  'value',
  'nonce',
  'gas',
  'gas_price',
  'max_fee_per_gas',
  'max_priority_fee_per_gas',
  'type',
  'v',
  'r',
  's',
  'access_list',
  'status',
  'receipt_gas_used',
  'cumulative_gas_used',
  'effective_gas_price',
  'contract_address',
] as const

/** Fixed column order for `logs` COPY ingestion. */
export const LOG_COPY_COLUMNS = [
  'block_number',
  'log_index',
  'transaction_index',
  'address',
  'topic0',
  'topic1',
  'topic2',
  'topic3',
  'data',
] as const

export const NUMERIC_POS = 0x0000
export const NUMERIC_NEG = 0x4000

/** Field count for one `logs` COPY tuple. */
export const LOG_COPY_FIELD_COUNT = 9

/** Default bounded COPY chunk size (256 KiB). */
export const DEFAULT_COPY_CHUNK_BYTES = 256 * 1024

/** Minimum allowed COPY chunk size (16 KiB). */
export const MIN_COPY_CHUNK_BYTES = 16 * 1024

/** Maximum allowed COPY chunk size (16 MiB). */
export const MAX_COPY_CHUNK_BYTES = 16 * 1024 * 1024
