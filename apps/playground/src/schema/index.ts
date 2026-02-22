import { defineRelations } from 'drizzle-orm'
import { datasets } from './datasets.ts'
import { pieces } from './pieces.ts'

export const schema = { datasets, pieces }

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
