import { buildConflictUpdateColumns } from '@hugomrdias/foxer'

import type { Registry } from '../../foxer.config.ts'
import { schema } from '../schema/index.ts'

// TODO add contract to the context

export function handleSessionKeys(registry: Registry) {
  registry.on('sessionKeyRegistry:AuthorizationsUpdated', async ({ context, event }) => {
    context.logger.debug(
      { event: event.args, transaction: event.transaction.hash },

      'AuthorizationsUpdated',
    )

    await context.db
      .insert(schema.sessionKeys)
      .values({
        signer: event.args.signer,
        identity: event.args.identity,
        origin: event.args.origin,
        blockNumber: event.block.number,
        createdAt: event.block.timestamp,
        updatedAt: event.block.timestamp,
      })
      .onConflictDoUpdate({
        target: [schema.sessionKeys.signer],
        set: {
          origin: event.args.origin,
          updatedAt: event.block.timestamp,
        },
      })

    await context.db
      .insert(schema.sessionKeyPermissions)
      .values(
        event.args.permissions.map((permission) => ({
          signer: event.args.signer,
          permission: permission,
          expiry: event.args.expiry,
        })),
      )
      .onConflictDoUpdate({
        target: [schema.sessionKeyPermissions.signer, schema.sessionKeyPermissions.permission],
        set: buildConflictUpdateColumns(schema.sessionKeyPermissions, ['expiry']),
      })
  })
}
