#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { cli } from 'cleye'

import { create } from './create.ts'
import { dev } from './dev.ts'
import { serve } from './serve.ts'
import { start } from './start.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const packageJsonPath = resolve(__dirname, '../../package.json')
const packageJson = JSON.parse(
  readFileSync(packageJsonPath, { encoding: 'utf8' })
)

const argv = cli({
  name: 'foxer',
  version: packageJson.version,
  commands: [dev, create, start, serve],
  help: {
    version: packageJson.version,
  },
})

if (!argv.command) {
  argv.showHelp()
  process.exit(1)
}
