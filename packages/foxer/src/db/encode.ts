import type { Hash } from 'viem'
import type {
  ChainBlock,
  ChainTransaction,
  EncodedBlock,
  EncodedBlockWithTransactions,
  EncodedTransaction,
} from '../types'

export function encodeTransaction(tx: ChainTransaction): EncodedTransaction {
  return {
    hash: tx.hash,
    blockNumber: tx.blockNumber,
    transactionIndex: tx.transactionIndex,
    blockHash: tx.blockHash,
    from: tx.from,
    to: tx.to ?? null,
    input: tx.input,
    value: tx.value,
    nonce: tx.nonce,
    r: tx.r,
    s: tx.s,
    v: tx.v,
    type: tx.type,
    gas: tx.gas ?? null,
    gasPrice: tx.gasPrice ?? null,
    maxFeePerGas: tx.maxFeePerGas ?? null,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? null,
    accessList: tx.accessList ?? null,
  }
}

export function encodeBlock(block: ChainBlock): EncodedBlock {
  return {
    number: block.number,
    timestamp: block.timestamp,
    hash: block.hash,
    parentHash: block.parentHash,
    logsBloom: block.logsBloom,
    miner: block.miner,
    gasUsed: block.gasUsed,
    gasLimit: block.gasLimit,
    baseFeePerGas: block.baseFeePerGas ?? null,
    nonce: block.nonce,
    mixHash: block.mixHash,
    stateRoot: block.stateRoot,
    receiptsRoot: block.receiptsRoot,
    transactionsRoot: block.transactionsRoot,
    sha3Uncles: block.sha3Uncles,
    size: block.size,
    difficulty: block.difficulty,
    totalDifficulty: block.totalDifficulty ?? null,
    extraData: block.extraData,
  }
}

export function encodeBlockWithTransactions(
  block: ChainBlock
): EncodedBlockWithTransactions {
  return {
    ...encodeBlock(block),
    transactions: block.transactions.map(encodeTransaction),
  }
}

const EMPTY_TRIE_HASH =
  '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421'
const EMPTY_LOGS_BLOOM =
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
export function encodeNullRoundBlock(options: {
  number: bigint
  hash: Hash
}): EncodedBlockWithTransactions {
  return {
    number: options.number,
    // TODO: probably should be previous block timestamp plus 30 seconds
    timestamp: BigInt(Math.floor(Date.now() / 1000)),
    hash: options.hash,
    parentHash: options.hash,
    logsBloom: EMPTY_LOGS_BLOOM,
    miner: '0x0000000000000000000000000000000000000000',
    gasUsed: 0n,
    gasLimit: 30_000_000n,
    baseFeePerGas: 1_000_000_000n,
    nonce: '0x0000000000000000',
    mixHash:
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    stateRoot: EMPTY_TRIE_HASH,
    receiptsRoot: EMPTY_TRIE_HASH,
    transactionsRoot: EMPTY_TRIE_HASH,
    sha3Uncles:
      '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
    size: 0n,
    difficulty: 0n,
    totalDifficulty: 0n,
    extraData: '0x',
    transactions: [],
  }
}
