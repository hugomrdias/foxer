// import { metadataArrayToObject } from '@filoz/synapse-core/utils'
// import { and, eq, inArray } from 'drizzle-orm'
// import { stringify } from 'viem'
// import { datasets, pieces } from '../db/schema'
// import type { HookRegistry } from './registry'

// /**
//  * Registers the built-in contract event handlers that persist indexed rows.
//  */
// export function registerDefaultHooks(registry: HookRegistry): void {
//   registry.on('storage:DataSetCreated', async ({ context, event }) => {
//     // console.debug('storage:DataSetCreated', stringify(event.args))
//     const args = event.args
//     const accountAddress = args.payer
//     const now = new Date()

//     const metadata = metadataArrayToObject([
//       args.metadataKeys,
//       args.metadataValues,
//     ])
//     await context.db
//       .insert(datasets)
//       .values({
//         id: args.dataSetId,
//         providerId: args.providerId,
//         storageProvider: args.serviceProvider,
//         payee: args.payee,
//         pdpRailId: args.pdpRailId,
//         cdnRailId: args.cdnRailId,
//         cacheMissRailId: args.cacheMissRailId,
//         blockNumber: context.blockNumber,
//         accountAddress,
//         metadata,
//         createdAt: now,
//         updatedAt: now,
//       })
//       .onConflictDoUpdate({
//         target: [datasets.id],
//         set: {
//           providerId: args.providerId,
//           storageProvider: args.serviceProvider,
//           payee: args.payee,
//           pdpRailId: args.pdpRailId,
//           cdnRailId: args.cdnRailId,
//           cacheMissRailId: args.cacheMissRailId,
//           metadata,
//           blockNumber: context.blockNumber,
//           accountAddress,
//           updatedAt: now,
//         },
//       })
//   })

//   registry.on('storage:ServiceTerminated', async ({ context, event }) => {
//     // console.debug("pdpVerifier:DataSetDeleted", stringify(event.args));
//     const args = event.args
//     await context.db
//       .delete(datasets)
//       .where(and(eq(datasets.id, args.dataSetId)))
//   })

//   registry.on('pdpVerifier:PiecesAdded', async ({ context, event }) => {
//     // console.debug("pdpVerifier:PiecesAdded", stringify(event.args));
//     const args = event.args
//     if (args.pieceIds.length === 0) {
//       return
//     }

//     const dataset = await context.db.query.datasets.findFirst({
//       where: and(eq(datasets.id, args.setId)),
//       columns: { id: true },
//     })

//     if (!dataset) {
//       return
//     }

//     const now = new Date()
//     const piecesToInsert = args.pieceIds.map((pieceId, index) => {
//       const pieceCid = args.pieceCids[index]?.data ?? null
//       return {
//         id: pieceId,
//         blockNumber: context.blockNumber,
//         datasetId: args.setId,
//         accountAddress: event.transaction.from,
//         cid: pieceCid,
//         createdAt: now,
//       }
//     })

//     await context.db
//       .insert(pieces)
//       .values(piecesToInsert)
//       .onConflictDoUpdate({
//         target: [pieces.datasetId, pieces.id],
//         set: {
//           blockNumber: context.blockNumber,
//           accountAddress: event.transaction.from,
//         },
//       })
//   })

//   registry.on('pdpVerifier:PiecesRemoved', async ({ context, event }) => {
//     // console.debug("pdpVerifier:PiecesRemoved", stringify(event.args));
//     const args = event.args
//     if (args.pieceIds.length === 0) {
//       return
//     }

//     await context.db
//       .delete(pieces)
//       .where(
//         and(eq(pieces.datasetId, args.setId), inArray(pieces.id, args.pieceIds))
//       )
//   })
// }
