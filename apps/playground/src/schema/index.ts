import { defineRelations } from 'drizzle-orm/relations'
import { datasets } from './datasets.ts'
import { pieces } from './pieces.ts'
import { providers } from './providers.ts'

export const schema = { datasets, pieces, providers }

export const relations = defineRelations({ datasets, pieces }, (r) => {
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
  }
})
