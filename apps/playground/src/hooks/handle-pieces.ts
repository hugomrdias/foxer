import { and, eq, inArray } from 'drizzle-orm'
import type { Registry } from '../../foxer.config.ts'
import { schema } from '../schema/index.ts'

// TODO add contract to the context

export function handlePieces(registry: Registry) {
  registry.on('pdpVerifier:PiecesAdded', async ({ context, event }) => {
    context.logger.silent({ event: event.args }, 'PiecesAdded')
    const args = event.args
    if (args.pieceIds.length === 0) {
      return
    }

    const dataset = await context.db.query.datasets.findFirst({
      where: {
        dataSetId: args.setId,
      },
      columns: { dataSetId: true, payer: true },
    })

    if (!dataset) {
      return
    }

    const piecesToInsert = args.pieceIds.map((pieceId, index) => {
      const pieceCid = args.pieceCids[index]?.data ?? null
      return {
        id: pieceId,
        blockNumber: event.block.number,
        datasetId: args.setId,
        address: dataset.payer,
        cid: pieceCid,
      }
    })

    await context.db
      .insert(schema.pieces)
      .values(piecesToInsert)
      .onConflictDoNothing()
  })

  registry.on('pdpVerifier:PiecesRemoved', async ({ context, event }) => {
    context.logger.silent({ event: event.args }, 'PiecesRemoved')
    const args = event.args
    if (args.pieceIds.length === 0) {
      return
    }

    await context.db
      .delete(schema.pieces)
      .where(
        and(
          eq(schema.pieces.datasetId, args.setId),
          inArray(schema.pieces.id, args.pieceIds)
        )
      )
  })
}
