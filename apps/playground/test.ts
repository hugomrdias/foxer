import { drizzle } from 'drizzle-orm/pg-proxy'
import { relations, schema } from './src/schema/index.ts'

const db = drizzle(
  async (sql, params, method) => {
    const rsp = await fetch('http://localhost:4200/sql', {
      method: 'POST',
      body: JSON.stringify({
        sql,
        params,
        method,
      }),
    })
    if (!rsp.ok) {
      throw new Error((await rsp.json()).error)
    }
    return { rows: await rsp.json() }
  },
  {
    relations: relations,
    schema: schema,
    casing: 'snake_case',
  }
)

const datasets = await db.query.datasets.findMany({
  limit: 2,
  offset: 0,
  orderBy: {
    dataSetId: 'desc',
  },
})

console.log(datasets)
