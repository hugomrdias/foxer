import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import { schemaFiles } from 'foxer'

config({
  quiet: true,
  path: '.env.local',
})

export default defineConfig({
  out: './drizzle',
  schema: ['./src/schema/*.ts', ...schemaFiles],
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5432/drizzle_indexer',
  },
})
