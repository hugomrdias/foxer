import { customType } from 'drizzle-orm/pg-core'
import { type Address, type Hash, type Hex, stringify } from 'viem'

export const numeric78 = customType<{ data: bigint; driverData: string }>({
  dataType() {
    return 'numeric(78,0)'
  },
  fromDriver(value: string) {
    return BigInt(value)
  },
})

export const hex = customType<{
  data: Hex
  driverData: string
  config?: { length: number | undefined }
}>({
  dataType(config) {
    if (config?.length) {
      return `varchar(${config.length})`
    }
    return 'varchar'
  },
  fromDriver(value: string) {
    return value as Hex
  },
})

/**
 * Hash column type
 * @param config - Configuration for the column
 * @param config.length - Length of the column (default: 66)
 * @returns Hash column type
 */
export const hash = customType<{
  data: Hash
  driverData: string
  config?: { length: number | undefined }
}>({
  dataType(config) {
    if (config?.length) {
      return `varchar(${config.length})`
    }
    return 'varchar(66)'
  },
  fromDriver(value: string) {
    return value as Hash
  },
})

export const address = customType<{
  data: Address
  driverData: string
  config?: { length: number | undefined }
}>({
  dataType(config) {
    if (config?.length) {
      return `varchar(${config.length})`
    }
    return 'varchar(42)'
  },
  fromDriver(value: string) {
    return value as Address
  },
})

/**
 * Bigint column type (8 bytes)
 * For bigger number see {@link numeric78}, {@link uint256} and {@link int256}
 * @returns Bigint column type
 */
export const bigint = customType<{ data: bigint; driverData: string }>({
  dataType() {
    return 'bigint'
  },
  fromDriver(value: string) {
    return BigInt(value)
  },
})

export const uint256 = numeric78
export const int256 = numeric78

export const jsonb = customType<{ data: unknown; driverData: string }>({
  dataType() {
    return 'jsonb'
  },
  toDriver(value: unknown): string {
    return stringify(value)
  },
})

export const bytea = customType<{ data: Hex; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
  toDriver(value: string): Buffer {
    return Buffer.from(value.slice(2), 'hex')
  },
  fromDriver(value: Buffer): Hex {
    const hex = value.toString('hex')
    const _value = hex.startsWith('\\x') ? hex.slice(2) : hex
    return `0x${_value}` as Hex
  },
})
