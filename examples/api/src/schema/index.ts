import { defineRelations } from 'drizzle-orm/relations'

import { datasets } from './datasets.ts'
import { pieces } from './pieces.ts'
import { providers } from './providers.ts'
import { sessionKeyPermissions, sessionKeys } from './session-keys.ts'

export const schema = {
  datasets,
  pieces,
  providers,
  sessionKeys,
  sessionKeyPermissions,
}

export const relations = defineRelations(
  { datasets, pieces, sessionKeys, sessionKeyPermissions },
  (r) => {
    return {
      datasets: {
        pieces: r.many.pieces(),
      },
      pieces: {
        dataset: r.one.datasets({
          from: r.pieces.datasetId,
          to: r.datasets.dataSetId,
        }),
      },
      sessionKeys: {
        permissions: r.many.sessionKeyPermissions(),
      },
      sessionKeyPermissions: {
        sessionKey: r.one.sessionKeys({
          from: r.sessionKeyPermissions.signer,
          to: r.sessionKeys.signer,
        }),
      },
    }
  },
)
