import { customType } from 'drizzle-orm/pg-core'
import { hex as hexCodec } from 'iso-base/rfc4648'
import type { Address, Hash, Hex } from 'viem'

export const numeric78 = customType<{ data: bigint; driverData: string }>({
  dataType() {
    return 'numeric(78,0)'
  },
  fromDriver(value: string) {
    return BigInt(value)
  },
})

export const int8 = customType<{ data: bigint; driverData: string }>({
  dataType() {
    return 'bigint'
  },
  fromDriver(value: string) {
    return BigInt(value)
  },
})

export const bytea = customType<{ data: Hex; driverData: Uint8Array }>({
  dataType() {
    return 'bytea'
  },
  toDriver(value: Hex): Uint8Array {
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
      return `0x${hexCodec.encode(value).toLowerCase()}` as Hex
    }

    throw new Error('Invalid bytea value')
  },
})

export const hash = bytea as unknown as typeof bytea &
  (() => ReturnType<typeof bytea> & { _: { data: Hash } })

export const address = bytea as unknown as typeof bytea &
  (() => ReturnType<typeof bytea> & { _: { data: Address } })

export const uint256 = numeric78
