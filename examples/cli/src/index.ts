#!/usr/bin/env node
import { cli } from 'cleye'

import { create } from './commands/create.ts'
import { fund } from './commands/fund.ts'
import { init } from './commands/init.ts'
import { revoke } from './commands/revoke.ts'
import { watch } from './commands/watch.ts'
import { name, version } from './config.ts'

const argv = cli({
  name,
  version,
  commands: [init, create, fund, revoke, watch],
})

if (!argv.command) {
  argv.showHelp()
  process.exit(1)
}
