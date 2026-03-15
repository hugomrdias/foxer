import * as p from '@clack/prompts'
import * as SessionKey from '@filoz/synapse-core/session-key'
import { type Command, command } from 'cleye'
import { stringify } from 'viem'
import { generatePrivateKey } from 'viem/accounts'

import { privateKeyClient } from '../client.ts'
import { globalFlags } from '../flags.ts'
import { hashLink } from '../utils.ts'

export const create: Command = command(
  {
    name: 'create',
    alias: 'c',
    flags: {
      ...globalFlags,
    },
    help: {
      description: 'Create a session key',
    },
  },
  async (argv) => {
    const { client, chain } = privateKeyClient(argv.flags.chain)
    const sessionKey = SessionKey.fromSecp256k1({
      privateKey: generatePrivateKey(),
      root: client.account,
      chain,
    })

    p.log.info(`Root address: ${sessionKey.account.rootAddress}`)
    p.log.info(`Session key address: ${sessionKey.account.address}`)

    const { event: loginEvent } = await SessionKey.loginSync(client, {
      address: sessionKey.address,
      onHash(hash) {
        p.log.step(`Waiting for tx ${hashLink(hash, chain)} to be mined...`)
      },
    })
    p.log.success(`Login event: ${stringify(loginEvent.args)}`)
  }
)
