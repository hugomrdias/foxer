import type { InternalConfig } from '../../config.ts'
import type { Database } from '../../db/client.ts'
import type { Logger } from '../../utils/logger.ts'

export type JsonRpcId = string | number | null

export type JsonRpcRequest = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: unknown[]
}

export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId; result: unknown }
  | {
      jsonrpc: '2.0'
      id: JsonRpcId
      error: { code: number; message: string; data?: unknown }
    }

export type MethodContext = {
  db: Database
  config: InternalConfig
  logger: Logger
}
