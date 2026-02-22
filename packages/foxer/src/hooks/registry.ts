import type { GetEventArgs, Log } from 'viem'
import type { Database } from '../db/client'
import type {
  BlockSimpleWithTransactions,
  ContractAbiByEventKey,
  ContractAbiEventByEventKey,
  ContractsConfig,
  EventKey,
  EventNameFromEventKey,
  MergedContractEvents,
  TransactionSimple,
} from '../utils/types'

export type HookContext = {
  db: Database
  chainId: bigint
  blockNumber: bigint
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
  block: BlockSimpleWithTransactions
  transaction: TransactionSimple
}

export type EventHook<
  C extends ContractsConfig<NonNullable<unknown>>,
  Event extends EventKey = EventKey,
> = (args: {
  context: HookContext
  event: DecodedEvent<C, Event>
  log: Log<bigint, number, false, ContractAbiEventByEventKey<C, Event>>
}) => Promise<void> | void

/**
 * Registry for strongly typed contract-event hooks.
 */
export class HookRegistry<
  C extends ContractsConfig<NonNullable<unknown>> = ContractsConfig<
    NonNullable<unknown>
  >,
> {
  private readonly hooks = new Map<MergedContractEvents<C>, EventHook<C>>()

  /**
   * Registers a hook for a specific `contract:event` key.
   */
  on<K extends MergedContractEvents<C>>(
    streamKey: K,
    hook: EventHook<C, K>
  ): void {
    this.hooks.set(streamKey, hook as unknown as EventHook<C>)
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
    block: BlockSimpleWithTransactions
    transaction: TransactionSimple
    context: HookContext
  }): Promise<void> {
    const { key, args, log, block, transaction, context } = options
    const hook = this.hooks.get(key) as unknown as EventHook<C, K>
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
      log,
    })
  }
}
