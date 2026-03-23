import { calibration } from '@filoz/synapse-core/chains'
import { metadataArrayToObject } from '@filoz/synapse-core/utils'
import type { Logger } from '@hugomrdias/foxer'
import { eq } from 'drizzle-orm'
import { type Address, decodeFunctionData, zeroAddress } from 'viem'

import type { Registry } from '../../foxer.config'
import { schema } from '../schema/index.ts'

// TODO add contract to the context

export function handleDatasets(registry: Registry) {
  registry.on('storage:DataSetCreated', async ({ context, event }) => {
    context.logger.silent({ event: event.args }, 'DataSetCreated')
    const ds = event.args

    const metadata = metadataArrayToObject([ds.metadataKeys, ds.metadataValues])
    const listenerAddr = decodeTxInput(event.transaction.input, context.logger)

    await context.db
      .insert(schema.datasets)
      .values({
        ...ds,
        metadata,
        listenerAddr,
        blockNumber: event.block.number,
        createdAt: event.block.timestamp,
        updatedAt: event.block.timestamp,
      })
      .onConflictDoUpdate({
        target: [schema.datasets.dataSetId],
        set: {
          listenerAddr,
          updatedAt: event.block.timestamp,
          createdAt: event.block.timestamp,
        },
      })
  })
  registry.on('storage:ServiceTerminated', async ({ context, event }) => {
    context.logger.silent({ event: event.args }, 'DataSetDeleted')
    const ds = event.args
    await context.db
      .delete(schema.datasets)
      .where(eq(schema.datasets.dataSetId, ds.dataSetId))
  })
}

function decodeTxInput(input: `0x${string}`, logger: Logger): Address {
  const { functionName, args } = decodeFunctionData({
    abi: calibration.contracts.pdp.abi,
    data: input,
  })

  if (functionName === 'createDataSet') {
    return args[0] as Address
  }
  if (functionName === 'addPieces') {
    return args[1] as Address
  }

  logger.error({ functionName, args }, 'Unknown function name')

  return zeroAddress as Address
}
