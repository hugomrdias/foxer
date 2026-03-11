import { defineConfig } from 'drizzle-kit'
import { schemaFiles } from 'foxer/schema'

export default defineConfig({
  out: './drizzle',
  schema: ['./src/schema/*.ts', ...schemaFiles],
  dialect: 'postgresql',
  casing: 'snake_case',
})
