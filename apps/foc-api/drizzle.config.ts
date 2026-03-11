import { schemaFiles } from '@hugomrdias/foxer/schema'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: ['./src/schema/*.ts', ...schemaFiles],
  dialect: 'postgresql',
  casing: 'snake_case',
})
