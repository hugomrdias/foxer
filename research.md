Building a robust indexer for Filecoin EVM (FEVM) using viem requires a two-pronged strategy: an efficient backfill process for historical logs and a live-sync listener that can roll back state when the chain reorganizes.

Because Filecoin uses "Tipsets" and has a different consensus model than Ethereum (Expected Consensus), reorgs can be deeper and more frequent than on some L2s.

1. The Architectural Strategy
A production-grade indexer should separate these two modes:

Historical Backfill: Uses getLogs (HTTP) to fetch events in chunks from a starting block up to a "safe" (finalized) height.

Live Sync: Uses watchContractEvent (WebSocket/Polling) to listen for the most recent blocks.

2. Best Way to Get All Events
For FEVM, the most reliable method is using getLogs with a batching strategy to avoid RPC timeouts.

TypeScript
import { createPublicClient, http, parseAbiItem } from 'viem'
import { filecoin } from 'viem/chains'

const client = createPublicClient({ 
  chain: filecoin,
  transport: http() 
})

async function fetchLogs(fromBlock: bigint, toBlock: bigint) {
  const logs = await client.getLogs({
    address: '0x...',
    event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
    fromBlock,
    toBlock,
  })
  return logs
}
Pro Tip for Filecoin:

Batch Sizes: Filecoin RPCs can be sensitive to large ranges. Start with a batch size of 1,000–2,000 blocks and adjust based on the node's performance.

Parallelization: You can run multiple getLogs requests in parallel (e.g., Promise.all), but be mindful of rate limits.

3. Detecting and Handling Reorgs
A reorg happens when the block hash of a certain height changes in your database compared to what the RPC now reports.

Step 1: Detect with Hash Continuity
When you fetch a new block, always check if the parentHash of the new block matches the blockHash you last saved in your database.

Step 2: Use watchContractEvent
Viem’s watchContractEvent has a built-in mechanism for reorgs. When a log is removed from the chain due to a reorg, it is emitted again with a removed: true flag.

TypeScript
const unwatch = client.watchContractEvent({
  address: '0x...',
  abi: [...],
  eventName: 'Transfer',
  onLogs: logs => {
    for (const log of logs) {
      if (log.removed) {
        // 🚨 REORG DETECTED
        handleRollback(log)
      } else {
        // ✅ VALID LOG
        handleNewEvent(log)
      }
    }
  },
})
Step 3: Implement a "Confirmation Depth"
To minimize reorg handling logic, index in "Real-Time-ish" rather than absolute real-time.

Fetch currentBlock.

Only process events up to currentBlock - 10 (or whatever depth you consider "safe").

On Filecoin, with Fast Finality (F3) now rolling out, finality is significantly faster, but a buffer of 10–30 blocks is still a common safety practice for non-critical indexing.

4. Summary Table: Indexer Logic
Feature	Implementation	Why?
History	getLogs in 1,000-block chunks	Avoids RPC timeouts and memory overflows.
Live Data	watchContractEvent	Provides removed flag for easy reorg detection.
Integrity	Parent Hash Validation	Detects reorgs even if the RPC doesn't flag them.
Persistence	Atomic DB Transactions	Ensures you don't save events if the "last synced block" update fails.
Would you like me to help you write a TypeScript loop that handles the block-by-block parent hash validation for your database?

You said
Yes do it

To build a robust reorg-resilient indexer, you need a Block Tracker logic. This logic ensures that your database always reflects a single, continuous chain of blocks. If the chain "snaps" (the hash of the previous block changes), you must pop the last recorded block and re-sync.

The Reorg Detection Logic
The core idea is to store the blockHash and parentHash for every block you index. Before processing block N, you verify that its parentHash matches the blockHash of N−1 currently in your database.

Implementation: The Validation Loop
Here is a conceptual implementation using viem that you can integrate into your indexing service:

TypeScript
import { createPublicClient, http, type Block } from 'viem'
import { filecoin } from 'viem/chains'

const client = createPublicClient({ 
  chain: filecoin, 
  transport: http() 
})

async function syncBlock(blockNumber: bigint) {
  const block = await client.getBlock({ blockNumber })
  const lastIndexedBlock = await db.getLastBlock() // Your DB query

  // 1. Detect Reorg
  if (lastIndexedBlock && block.parentHash !== lastIndexedBlock.hash) {
    console.warn(`Reorg detected at block ${blockNumber}! Rolling back...`)
    await rollback(lastIndexedBlock.blockNumber)
    // Return to previous block to re-sync the new canonical branch
    return syncBlock(blockNumber - 1n)
  }

  // 2. Process Events
  const logs = await client.getLogs({
    fromBlock: blockNumber,
    toBlock: blockNumber,
    // address: '0x...',
  })
  
  await db.transaction(async (tx) => {
    await tx.saveLogs(logs)
    await tx.saveBlock({ 
      number: block.number, 
      hash: block.hash, 
      parentHash: block.parentHash 
    })
  })
}

async function rollback(blockNumber: bigint) {
  // 3. Rollback Logic
  // Remove events and the block record from your DB for this height
  await db.deleteEventsForBlock(blockNumber)
  await db.deleteBlockRecord(blockNumber)
}
Best Practices for Filecoin EVM
The "Finality" Window: In Filecoin, "Finality" is typically reached after 900 epochs (roughly 7.5 hours) for absolute certainty, but for most dApps, waiting 30 epochs (15 minutes) is the standard "safe" threshold to avoid frequent small reorgs.

Atomic Transactions: Use a database transaction (SQL or NoSQL sessions) to ensure that you never update your "Last Synced Block" marker unless the event data for that block was successfully written.

Backpressure: If your syncBlock function falls too far behind the head, switch from processing 1 block at a time to a getLogs batch of 100 blocks to catch up, then resume the one-by-one validation at the tip of the chain.

Handling the "Removed" Flag
While the manual hash check above is the "gold standard" for DB integrity, don't ignore viem's built-in removed flag in watchContractEvent. If you are using a WebSocket or long-polling:

If log.removed === true, immediately find that log in your database by its transaction hash and log index and delete it.

If log.removed === false, insert it.

Would you like me to help you design the SQL schema for your blocks and events tables to make these rollbacks efficient?

You said
Yes

To handle reorgs efficiently, your database needs to be able to "undo" operations quickly. A relational schema (like PostgreSQL) is ideal here because it supports Atomic Transactions, ensuring that you never have a "half-indexed" block.

The Database Schema
You need two primary tables: one to track the Chain Structure (to detect reorgs) and one to store your Contract Events.

SQL
-- 1. Blocks Table: The "Source of Truth" for the chain state
CREATE TABLE indexed_blocks (
    block_number BIGINT PRIMARY KEY,
    block_hash TEXT NOT NULL UNIQUE,
    parent_hash TEXT NOT NULL,
    indexed_at TIMESTAMP DEFAULT NOW()
);

-- 2. Events Table: Your specific business data
CREATE TABLE transfer_events (
    id SERIAL PRIMARY KEY,
    block_number BIGINT REFERENCES indexed_blocks(block_number) ON DELETE CASCADE,
    transaction_hash TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    sender TEXT NOT NULL,
    receiver TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    -- Unique constraint prevents duplicate indexing of the same log
    UNIQUE(transaction_hash, log_index)
);

-- Index for performance
CREATE INDEX idx_blocks_hash ON indexed_blocks(block_hash);
Why this works: ON DELETE CASCADE
Notice the ON DELETE CASCADE in the events table. This is your "secret weapon" for reorgs. When your TypeScript code detects a hash mismatch and runs:
DELETE FROM indexed_blocks WHERE block_number = 100;
Postgres will automatically delete every event associated with that block. This prevents your database from having "ghost events" from a discarded fork.

The "Deep Sync" Logic
When your indexer starts up, it should perform a "Sanity Check" on the last 5-10 blocks to ensure the RPC hasn't shifted while the indexer was offline.

Implementation in TypeScript (The Rollback)
Using a library like knex or prisma, your rollback function becomes very clean:

TypeScript
async function handleReorg(detectedAtBlock: bigint) {
  console.log(`Reorg detected at ${detectedAtBlock}. Rolling back...`);
  
  // We go back 1 block and check again. 
  // In most EVM chains, reorgs are only 1-2 blocks deep.
  const blockToInvalidate = detectedAtBlock - 1n;
  
  await db.transaction(async (tx) => {
    // This triggers the CASCADE DELETE in the DB
    await tx('indexed_blocks').where('block_number', blockToInvalidate).del();
  });

  // Recursively check the previous block until hashes match
  await syncBlock(blockToInvalidate);
}
Pro-Tips for Filecoin EVM
Numeric Precision: Filecoin (like Ethereum) uses 256-bit integers. Standard SQL INTEGER won't work. Use NUMERIC or TEXT to store amounts to avoid overflows.

Finality Lag: Since Filecoin reorgs can be deeper than Polygon or Optimism, keep at least 2,000 blocks in your indexed_blocks table before "pruning" old history. This gives you a massive buffer for recovery.

Multicall: If you need to fetch extra data (like tokenURI or balanceOf) during the event loop, use viem's multicall to batch those requests into a single RPC call per block.

Would you like me to show you how to set up a "Head Follower" using watchBlockNumber so your indexer stays synced in real-time?

You said
Yes

To keep your indexer synced in real-time, you need a "Head Follower." This service listens for the latest block produced by the Filecoin network and triggers your indexing logic.

1. Real-Time Sync Strategy
Using watchBlockNumber is more efficient than watchBlocks for an indexer because it only returns the number. This allows you to fetch the full block and its logs in a single, controlled step within your existing validation logic.

2. Implementation: The Head Follower
This script sets up a persistent listener. It includes a basic "Queue" pattern to ensure that if blocks arrive faster than you can process them, they are handled in the correct order.

TypeScript
import { createPublicClient, http } from 'viem';
import { filecoin } from 'viem/chains';

const client = createPublicClient({ 
  chain: filecoin, 
  transport: http() 
});

// A simple queue to prevent race conditions during rapid block production
let isProcessing = false;
const blockQueue: bigint[] = [];

async function startIndexer() {
  console.log("Starting real-time Head Follower...");

  client.watchBlockNumber({
    emitMissed: true, // Crucial: Catches up if the connection drops briefly
    onBlockNumber: (blockNumber) => {
      blockQueue.push(blockNumber);
      processQueue();
    },
  });
}

async function processQueue() {
  if (isProcessing || blockQueue.length === 0) return;

  isProcessing = true;
  const nextBlock = blockQueue.shift();

  try {
    if (nextBlock) {
      // Use the syncBlock function we discussed earlier
      // It handles the Hash Check and the actual DB insertion
      await syncBlock(nextBlock);
    }
  } catch (error) {
    console.error(`Failed to process block ${nextBlock}:`, error);
    // Optional: Re-queue the block to try again
    if (nextBlock) blockQueue.unshift(nextBlock);
  } finally {
    isProcessing = false;
    processQueue(); // Check for more blocks
  }
}
3. Key Reliability Features
emitMissed: true: If your internet blinks or the Filecoin RPC lags, viem will automatically fetch the block numbers you missed while offline and push them into your queue.

The Sequential Queue: Real-time indexing must be sequential. If you process Block 101 before Block 100, your parentHash check will fail and trigger a false reorg alert. The isProcessing flag ensures only one block is handled at a time.

Finality Buffer (Optional): If you find Filecoin reorgs are too frequent for your DB to handle comfortably, you can modify the listener to follow a "Safe" tag:

TypeScript
// To only index "safe" (unlikely to reorg) blocks:
client.watchBlockNumber({
  blockTag: 'safe', // or 'finalized' for even more certainty
  onBlockNumber: (n) => blockQueue.push(n)
});
Summary of the Indexer Flow
Boot: Fetch the last block_number from your DB.

Backfill: Run a loop from last_db_block to current_rpc_block - 30 using getLogs in chunks.

Live: Start the watchBlockNumber listener to handle the "Tip" of the chain.

Would you like me to help you write a systemd service file to ensure this indexer stays running 24/7 on your server?