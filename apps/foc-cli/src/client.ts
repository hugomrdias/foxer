import * as p from '@clack/prompts'
import { type Chain, getChain } from '@filoz/synapse-core/chains'
import {
  type Account,
  createPublicClient,
  createWalletClient,
  type Hex,
  http,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem'
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

export function privateKeyClient(chainId: number): {
  client: WalletClient<Transport, Chain, Account>
  chain: Chain
} {
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

export function publicClient(chainId: number): PublicClient {
  const chain = getChain(chainId)
  return createPublicClient({
    chain,
    transport: http(),
  })
}
