import { address, bytes32, emptyRoot, zeroLogsBloom } from './helpers.ts'

export function rpcBlock(number: bigint, transactions: unknown[] = []) {
  return {
    baseFeePerGas: '0x3b9aca00',
    blobGasUsed: '0x0',
    difficulty: '0x0',
    excessBlobGas: '0x0',
    extraData: '0x',
    gasLimit: '0x1c9c380',
    gasUsed: transactions.length === 0 ? '0x0' : '0x5208',
    hash: quantityHash(number),
    logsBloom: zeroLogsBloom,
    miner: address('0'),
    mixHash: bytes32('0'),
    nonce: '0x0000000000000000',
    number: `0x${number.toString(16)}`,
    parentHash: quantityHash(number === 0n ? 0n : number - 1n),
    receiptsRoot: emptyRoot,
    sha3Uncles: emptyRoot,
    size: '0x1',
    stateRoot: emptyRoot,
    timestamp: `0x${number.toString(16)}`,
    totalDifficulty: '0x0',
    transactions,
    transactionsRoot: emptyRoot,
    uncles: [],
    withdrawals: [],
    withdrawalsRoot: emptyRoot,
  }
}

function quantityHash(value: bigint) {
  return `0x${value.toString(16).padStart(64, '0')}` as const
}

export function rpcReceipt(logsBloom = `0x${'00'.repeat(255)}ab`) {
  return {
    blockHash: bytes32('b'),
    blockNumber: '0x7b',
    contractAddress: null,
    cumulativeGasUsed: '0x5208',
    effectiveGasPrice: '0x64',
    from: address('c'),
    gasUsed: '0x5208',
    logs: [
      {
        address: address('d'),
        blockHash: bytes32('b'),
        blockNumber: '0x7b',
        data: '0xABCD',
        logIndex: '0x0',
        removed: false,
        topics: [bytes32('e')],
        transactionHash: bytes32('a'),
        transactionIndex: '0x1',
      },
    ],
    logsBloom,
    status: '0x1',
    to: null,
    transactionHash: bytes32('a'),
    transactionIndex: '0x1',
    type: '0x2',
  }
}
