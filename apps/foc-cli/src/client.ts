import * as p from '@clack/prompts'
import { getChain } from '@filoz/synapse-core/chains'
import { createPublicClient, createWalletClient, type Hex, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { config } from './config.ts'

function privateKeyFromConfig() {
  const privateKey = config.get('privateKey')
  if (!privateKey) {
    p.log.error('Private key not found')
    p.outro('Please run `session-keys-cli init` to initialize the CLI')
    process.exit(1)
  }
  return privateKey
}

export function privateKeyClient(chainId: number) {
  const chain = getChain(chainId)

  const privateKey = privateKeyFromConfig()

  const account = privateKeyToAccount(privateKey as Hex)
  const client = createWalletClient({
    account,
    chain,
    transport: http(),
  })
  return {
    client,
    chain,
  }
}

export function publicClient(chainId: number) {
  const chain = getChain(chainId)
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  })
  return publicClient
}
