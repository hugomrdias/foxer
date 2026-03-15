import * as p from '@clack/prompts'
import { intro, log, outro, text } from '@clack/prompts'
import { type Command, command } from 'cleye'
import type { Hash } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

import { config, name } from '../config.ts'

export const init: Command = command(
  {
    name: 'init',
    description: 'Initialize the CLI',
    alias: 'i',
    flags: {
      auto: {
        type: Boolean,
        description: 'Generate a new private key',
      },
    },
    help: {
      description: 'Initialize the CLI',
      examples: [`${name} init`, `${name} init --auto`],
    },
  },
  async (argv) => {
    const privateKey = config.get('privateKey')
    if (privateKey) {
      const address = privateKeyToAccount(privateKey as Hash)
      log.success(`Private key: ${privateKey}`)
      log.info(`Address: ${address.address}`)
      log.info(`Config file: ${config.path}`)
      outro(`You're all set!`)
      return
    }
    if (argv.flags.auto) {
      intro(`Initializing ${name}...`)
      const privateKey = generatePrivateKey()
      log.success(`Private key: ${privateKey}`)
      config.set('privateKey', privateKey)
      outro(`You're all set!`)
      return
    }

    intro(`Initializing ${name}...`)
    const privateKeyInput = await text({
      message: 'Enter your private key',
      validate(value) {
        if (!value || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
          return `Invalid private key!`
        }
      },
    })
    if (p.isCancel(privateKeyInput)) {
      outro(`Initialization cancelled`)
      return
    }
    config.set('privateKey', privateKeyInput)
    outro(`You're all set!`)
  }
)
