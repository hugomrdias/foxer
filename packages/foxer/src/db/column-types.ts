import { customType } from 'drizzle-orm/pg-core'
import { hex as hexCodec } from 'iso-base/rfc4648'
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

export const bytea = customType<{ data: Hex; driverData: Uint8Array }>({
  dataType() {
    return 'bytea'
  },
  toDriver(value: string): Uint8Array {
    return Buffer.from(value.slice(2), 'hex')
  },
  fromDriver(value: unknown): Hex {
    if (typeof value === 'string') {
      return `0x${value.slice(2)}` as Hex
    }

    if (value instanceof Buffer) {
      return `0x${value.toString('hex')}` as Hex
    }

    if (value instanceof Uint8Array) {
      return `0x${hexCodec.encode(value)}` as Hex
    }

    throw new Error('Invalid value')
  },
})
