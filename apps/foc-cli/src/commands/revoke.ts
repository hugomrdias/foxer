/** biome-ignore-all lint/suspicious/noConsole: its ok */
import * as p from '@clack/prompts'
import * as SessionKey from '@filoz/synapse-core/session-key'
import { createClient } from '@hugomrdias/foxer-client'
import { type Command, command } from 'cleye'
import { Schema } from 'foc-api'

import { privateKeyClient } from '../client.ts'
import { globalFlags } from '../flags.ts'
import { hashLink } from '../utils.ts'

export const revoke: Command = command(
  {
    name: 'revoke',
    alias: 'r',
    flags: {
      ...globalFlags,
    },
    help: {
      description: 'Revoke a session key',
    },
  },
  async (argv) => {
    const { client, chain } = privateKeyClient(argv.flags.chain)
    const foxer = createClient({
      baseUrl: 'http://localhost:4200/sql',
      relations: Schema.relations,
      schema: Schema.schema,
    })
    const spinner = p.spinner()
    spinner.start('Fetching session keys...')
    try {
      const sessionKeys = await foxer.db.query.sessionKeys.findMany({
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

      spinner.stop(`Session keys fetched.`)

      if (sessionKeys.length === 0) {
        p.cancel('No session keys found.')
        process.exit(1)
      }

      const signer = await p.select({
        message: 'Select a session key:',
        options: sessionKeys.map((sessionKey) => ({
          value: sessionKey.signer,
          label: `#${sessionKey.signer} ${sessionKey.permissions
            .filter(
              (permission) =>
                permission.expiry &&
                permission.expiry > BigInt(Math.floor(Date.now() / 1000))
            )
            .map((permission) => permission.permission)
            .join(', ')}`,
        })),
      })

      if (p.isCancel(signer)) {
        p.cancel('Operation cancelled.')
        process.exit(1)
      }
      p.log.info(`Revoking session key ${signer}...`)

      await SessionKey.revokeSync(client, {
        address: signer,
        onHash(hash) {
          p.log.step(`Waiting for tx ${hashLink(hash, chain)} to be mined...`)
        },
      })
    } catch (error) {
      spinner.error('Failed to select session key')
      if (argv.flags.debug) {
        console.error(error)
      } else {
        p.log.error((error as Error).message)
      }
      process.exit(1)
    }
  }
)
