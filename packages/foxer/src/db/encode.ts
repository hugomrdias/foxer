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
    to: tx.to,
    input: tx.input,
    value: tx.value,
    nonce: tx.nonce,
    r: tx.r,
    s: tx.s,
    v: tx.v,
    type: tx.type,
    gas: tx.gas,
    gasPrice: tx.gasPrice,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
    accessList: tx.accessList,
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
    baseFeePerGas: block.baseFeePerGas,
    nonce: block.nonce,
    mixHash: block.mixHash,
    stateRoot: block.stateRoot,
    receiptsRoot: block.receiptsRoot,
    transactionsRoot: block.transactionsRoot,
    sha3Uncles: block.sha3Uncles,
    size: block.size,
    difficulty: block.difficulty,
    totalDifficulty: block.totalDifficulty,
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
