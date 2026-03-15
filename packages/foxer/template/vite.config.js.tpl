import { defineConfig } from 'vite-plus'

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
    plugins: ['promise', 'jsdoc', 'import', 'oxc', 'typescript', 'eslint', 'unicorn', 'react'],
    ignorePatterns: ['**/drizzle'],
  },
  fmt: {
    ignorePatterns: ['**/drizzle'],
    singleQuote: true,
    semi: false,
    sortImports: {
      order: 'asc',
    },
  },
})
