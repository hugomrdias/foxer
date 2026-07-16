import type { InternalConfig } from '../../config.ts'
import type { Database } from '../../db/client.ts'

export type JsonRpcId = string | number | null

export type JsonRpcRequest = {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: unknown[]
}

export type JsonRpcSuccessResponse = {
  jsonrpc: '2.0'
  id: JsonRpcId
  result: unknown
}

export type JsonRpcErrorResponse = {
  jsonrpc: '2.0'
  id: JsonRpcId
  error: { code: number; message: string; data?: unknown }
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse

export type MethodContext = {
  db: Database
  config: InternalConfig
}
