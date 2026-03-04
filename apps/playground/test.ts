import { createClient } from 'foxer/client'
import { relations, schema } from './src/schema/index.ts'

const baseUrl = 'http://localhost:4200/sql'
const client = createClient({ baseUrl, relations, schema })

client.live(
  (db) => {
    // return db
    //   .select()
    //   .from(schema.datasets)
    //   .orderBy(
    //     desc(schema.datasets.dataSetId),
    //     desc(schema.datasets.blockNumber)
    //   )
    //   .limit(40)
    //   .offset(0)
    // return db.execute(`SELECT * FROM datasets LIMIT 1 OFFSET 0`)
    return db.query.datasets.findMany({
      limit: 2,
      offset: 0,
      orderBy: {
        dataSetId: 'desc',
        blockNumber: 'desc',
      },
      with: {
        pieces: {
          limit: 10,
          offset: 0,
          orderBy: {
            id: 'desc',
          },
        },
      },
    })
  },
  (result) => {
    console.log('🚀 ~ createClient ~ result:', result)
  },
  (error) => {
    console.error(error)
  }
)

// await new Promise((resolve) => setTimeout(resolve, 1000))
// const datasets = await client.db.query.datasets.findMany({
//   limit: 50,
//   offset: 0,
//   orderBy: {
//     dataSetId: 'desc',
//     blockNumber: 'desc',
//   },
// })

// const datasets = await db.query.datasets.findFirst({
//   where: {
//     dataSetId: 11803n,
//   },
// })

// const datasets = await client.db.select().from(schema.datasets).limit(2)
// console.log(datasets)
