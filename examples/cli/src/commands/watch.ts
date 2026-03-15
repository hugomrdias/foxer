/** biome-ignore-all lint/suspicious/noConsole: its ok */
import * as p from '@clack/prompts'
import { createClient } from '@hugomrdias/foxer-client'
import { type Command, command } from 'cleye'
import { Schema } from 'foc-api'

import { privateKeyClient } from '../client.ts'
import { globalFlags } from '../flags.ts'

export const watch: Command = command(
  {
    name: 'watch',
    alias: 'w',
    flags: {
      ...globalFlags,
    },
    help: {
      description: 'Watch a session key',
    },
  },
  (argv) => {
    const { client } = privateKeyClient(argv.flags.chain)
    const foxer = createClient({
      baseUrl: 'http://localhost:4200/sql',
      relations: Schema.relations,
      schema: Schema.schema,
    })

    p.log.info('Watching session keys...')
    foxer.live(
      (db) => {
        return db.query.sessionKeys.findMany({
          limit: 10,
          offset: 0,
          orderBy: {
            blockNumber: 'desc',
          },
          where: {
            identity: client.account.address,
          },
          with: {
            permissions: true,
          },
        })
      },
      (result) => {
        p.log.info('Session keys:')
        result.forEach((sessionKey) => {
          p.log.info(
            `${sessionKey.signer} (${sessionKey.identity}) ${sessionKey.origin}`
          )
          sessionKey.permissions.forEach((permission) => {
            p.log.info(`  ${permission.permission} (${permission.expiry})`)
          })
        })
      },
      (error) => {
        p.log.error((error as Error).message)
        process.exit(1)
      }
    )
  }
)
