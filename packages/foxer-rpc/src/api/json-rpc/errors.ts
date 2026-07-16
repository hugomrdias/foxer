import type { Logger } from '../../utils/logger.ts'
import { error as errorResponse } from './response.ts'
import type {
  JsonRpcErrorResponse,
  JsonRpcId,
  JsonRpcRequest,
} from './types.ts'

export type JsonRpcHttpStatus = 200 | 413 | 415

type JsonRpcErrorOptions = {
  cause?: unknown
  data?: unknown
  httpStatus?: JsonRpcHttpStatus
  internalMessage?: string
}

/** Base class for every expected failure exposed by the JSON-RPC boundary. */
export abstract class JsonRpcError extends Error {
  readonly code: number
  readonly data?: unknown
  readonly httpStatus: JsonRpcHttpStatus
  readonly responseMessage: string

  constructor(
    code: number,
    message: string,
    options: JsonRpcErrorOptions = {}
  ) {
    super(options.internalMessage ?? message, { cause: options.cause })
    this.name = new.target.name
    this.code = code
    this.data = options.data
    this.httpStatus = options.httpStatus ?? 200
    this.responseMessage = message
  }
}

export class JsonRpcParseError extends JsonRpcError {
  constructor(cause: unknown) {
    super(-32700, 'Parse error', { cause })
  }
}

export class InvalidRequestError extends JsonRpcError {
  constructor(
    message = 'Invalid Request',
    options: Pick<JsonRpcErrorOptions, 'httpStatus'> = {}
  ) {
    super(-32600, message, options)
  }
}

export class RequestBodyTooLargeError extends InvalidRequestError {
  constructor() {
    super('Request body too large', { httpStatus: 413 })
  }
}

export class UnsupportedContentTypeError extends InvalidRequestError {
  constructor() {
    super('Content-Type must be application/json', { httpStatus: 415 })
  }
}

export class BatchRequestsUnsupportedError extends InvalidRequestError {
  constructor() {
    super('Batch requests are not supported')
  }
}

export class MethodNotFoundError extends JsonRpcError {
  constructor() {
    super(-32601, 'Method not found')
  }
}

export class InvalidParamsError extends JsonRpcError {
  constructor(message: string, data?: unknown) {
    super(-32602, message, { data })
  }
}

export class UpstreamJsonRpcError extends JsonRpcError {
  constructor(args: {
    cause: unknown
    code: number
    data?: unknown
    message: string
  }) {
    super(args.code, args.message, { cause: args.cause, data: args.data })
  }
}

export class UpstreamUnavailableError extends JsonRpcError {
  constructor(cause: unknown) {
    super(-32002, 'Upstream RPC unavailable', { cause })
  }
}

export class StreamCapacityExceededError extends JsonRpcError {
  readonly activeStreamConnections: number
  readonly maxStreamConnections: number

  constructor(args: {
    activeStreamConnections: number
    maxStreamConnections: number
  }) {
    super(-32005, 'Stream concurrency limit exceeded', {
      data: { maxConcurrentStreams: args.maxStreamConnections },
    })
    this.activeStreamConnections = args.activeStreamConnections
    this.maxStreamConnections = args.maxStreamConnections
  }
}

export class LogsBlockRangeTooLargeError extends JsonRpcError {
  constructor(maxBlockRange: bigint) {
    super(-32005, 'eth_getLogs block range too large', {
      data: { maxBlockRange: maxBlockRange.toString() },
    })
  }
}

/** Unexpected failures are typed at the boundary without exposing details. */
export class InternalJsonRpcError extends JsonRpcError {
  constructor(cause?: unknown, internalMessage?: string) {
    super(-32603, 'Internal error', {
      cause,
      internalMessage:
        internalMessage ??
        (cause instanceof Error ? cause.message : 'Unexpected JSON-RPC error'),
    })
  }
}

export class JsonRpcConfigurationError extends InternalJsonRpcError {
  constructor(message: string) {
    super(undefined, message)
  }
}

export class JsonRpcDataIntegrityError extends InternalJsonRpcError {
  constructor(message: string) {
    super(undefined, message)
  }
}

export class JsonRpcSerializationError extends InternalJsonRpcError {
  constructor(message: string, cause?: unknown) {
    super(cause, message)
  }
}

export class JsonRpcStreamStateError extends InternalJsonRpcError {
  constructor(message: string, cause?: unknown) {
    super(cause, message)
  }
}

export type JsonRpcFailureContext = {
  id: JsonRpcId
  logger: Logger
  maxConnections: number
  request?: Pick<JsonRpcRequest, 'method' | 'params'>
}

export type HandledJsonRpcFailure = {
  error: JsonRpcError
  response: JsonRpcErrorResponse
  status: JsonRpcHttpStatus
}

/**
 * Normalizes, logs, and serializes every JSON-RPC failure in one place.
 * Transports only decide whether the returned envelope can still be written.
 */
export function handleJsonRpcFailure(
  cause: unknown,
  context: JsonRpcFailureContext
): HandledJsonRpcFailure {
  const rpcError =
    cause instanceof JsonRpcError ? cause : new InternalJsonRpcError(cause)

  if (rpcError instanceof StreamCapacityExceededError) {
    context.logger.warn(
      {
        activeStreamConnections: rpcError.activeStreamConnections,
        maxConnections: context.maxConnections,
        maxStreamConnections: rpcError.maxStreamConnections,
        method: context.request?.method,
        params: context.request?.params ?? [],
        rejectionReason: 'stream_concurrency_limit',
      },
      'json-rpc stream rejected'
    )
  } else if (rpcError instanceof JsonRpcParseError) {
    context.logger.error({ error: rpcError }, 'json-rpc parse error')
  } else if (rpcError instanceof InternalJsonRpcError) {
    context.logger.error(
      { error: rpcError, method: context.request?.method },
      'json-rpc internal error'
    )
  }

  return {
    error: rpcError,
    response: errorResponse(
      context.id,
      rpcError.code,
      rpcError.responseMessage,
      rpcError.data
    ),
    status: rpcError.httpStatus,
  }
}
