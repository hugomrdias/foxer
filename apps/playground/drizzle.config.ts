import { defineConfig } from 'drizzle-kit'
import { schemaFiles } from 'foxer'

export default defineConfig({
  out: './drizzle',
  schema: ['./src/schema/*.ts', ...schemaFiles],
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5432/drizzle_indexer',
  },
})
