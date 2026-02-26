import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations'
import type { GetEventArgs, Log } from 'viem'
import type { Database } from '../db/client'
import type { EncodedBlockWithTransactions, EncodedTransaction } from '../types'
import type { Logger } from '../utils/logger'
import type {
  ContractAbiByEventKey,
  ContractAbiEventByEventKey,
  ContractsConfig,
  EventKey,
  EventNameFromEventKey,
  MergedContractEvents,
} from '../utils/types'

export type HookContext<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
> = {
  db: Database<TSchema, TRelations>
  chainId: number
  logger: Logger
}

export type DecodedEvent<
  C extends ContractsConfig<NonNullable<unknown>>,
  Event extends EventKey,
> = {
  // Resolve the concrete ABI for the `contract:event` key.
  args: GetEventArgs<
    ContractAbiByEventKey<C, Event>,
    EventNameFromEventKey<Event>,
    { EnableUnion: false; IndexedOnly: false; Required: true }
  >
  log: Log<bigint, number, false, ContractAbiEventByEventKey<C, Event>>
  block: EncodedBlockWithTransactions
  transaction: EncodedTransaction
}

export type EventHook<
  C extends ContractsConfig<NonNullable<unknown>>,
  Event extends EventKey = EventKey,
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
> = (args: {
  context: HookContext<TSchema, TRelations>
  event: DecodedEvent<C, Event>
}) => Promise<void> | void

/**
 * Registry for strongly typed contract-event hooks.
 */
export class HookRegistry<
  C extends ContractsConfig<NonNullable<unknown>> = ContractsConfig<
    NonNullable<unknown>
  >,
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
> {
  private readonly hooks = new Map<MergedContractEvents<C>, unknown>()

  /**
   * Registers a hook for a specific `contract:event` key.
   */
  on<K extends MergedContractEvents<C>>(
    streamKey: K,
    hook: EventHook<C, K, TSchema, TRelations>
  ): void {
    this.hooks.set(streamKey, hook)
  }

  /**
   * Decodes a log using stream ABI metadata and dispatches to the registered hook.
   */
  async dispatch<K extends MergedContractEvents<C>>(options: {
    key: K
    args: GetEventArgs<
      ContractAbiByEventKey<C, K>,
      EventNameFromEventKey<K>,
      { EnableUnion: false; IndexedOnly: false; Required: true }
    >
    log: Log<bigint, number, false, ContractAbiEventByEventKey<C, K>>
    block: EncodedBlockWithTransactions
    transaction: EncodedTransaction
    context: HookContext<TSchema, TRelations>
  }): Promise<void> {
    const { key, args, log, block, transaction, context } = options
    const hook = this.hooks.get(key) as unknown as EventHook<
      C,
      K,
      TSchema,
      TRelations
    >
    if (!hook) return

    const event = {
      args,
      log,
      block,
      transaction,
    } as DecodedEvent<C, K>

    await hook({
      context,
      event,
    })
  }
}
