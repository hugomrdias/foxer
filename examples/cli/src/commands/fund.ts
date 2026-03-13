import * as p from '@clack/prompts'
import { claimTokens, formatBalance } from '@filoz/synapse-core/utils'
import { type Command, command } from 'cleye'
import { getBalance, waitForTransactionReceipt } from 'viem/actions'

import { privateKeyClient } from '../client.ts'
import { globalFlags } from '../flags.ts'

export const fund: Command = command(
  {
    name: 'fund',
    description: 'Fund the wallet',
    alias: 'f',
    flags: {
      ...globalFlags,
    },
  },
  async (argv) => {
    const { client } = privateKeyClient(argv.flags.chain)

    p.intro('Funding wallet...')
    const spinner = p.spinner()

    spinner.start('Requesting faucets...')
    try {
      const hashes = await claimTokens({ address: client.account.address })

      spinner.message(`Waiting for transactions to be mined...`)
      await waitForTransactionReceipt(client, {
        hash: hashes[0].tx_hash,
      })

      spinner.stop('Balances')
      const balance = await getBalance(client, {
        address: client.account.address,
      })
      p.log.info(`FIL: ${formatBalance({ value: balance })}`)
    } catch (error) {
      spinner.stop()
      if (argv.flags.debug) {
        // biome-ignore lint/suspicious/noConsole: debugging
        console.error(error)
      } else {
        p.log.error((error as Error).message)
      }
      p.outro('Please try again')
      return
    } finally {
      spinner.stop()
      process.exit(0)
    }
  },
)
