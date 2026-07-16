import type { Context } from 'hono'
import { stream } from 'hono/streaming'

import { JsonRpcSerializationError, JsonRpcStreamStateError } from './errors.ts'
import type { JsonRpcErrorResponse, JsonRpcId } from './types.ts'

const DEFAULT_JSON_CHUNK_BYTES = 64 * 1024

export type JsonRpcOutputStream = {
  aborted: boolean
  abort: () => void
  onAbort: (listener: () => void | Promise<void>) => void
  write: (input: string) => Promise<unknown>
}

type AsyncCallback = () => void | Promise<void>
type ErrorCallback = (cause: unknown) => void | Promise<void>
type WriteScope<T> = (scope: T) => void | Promise<void>

export type StreamJsonRpcOptions = {
  handleError: (cause: unknown) => JsonRpcErrorResponse
  id: JsonRpcId
  chunkBytes?: number
}

export interface JsonRpcMethodStream {
  result(value: unknown): Promise<void>
  resultArray(write: WriteScope<JsonArrayStreamWriter>): Promise<void>
  resultObject(write: WriteScope<JsonObjectStreamWriter>): Promise<void>
  beforeFinish(callback: AsyncCallback): void
  onError(callback: ErrorCallback): void
}

export type JsonRpcStreamHandler = (
  stream: JsonRpcMethodStream
) => void | Promise<void>

/**
 * Creates a Hono response whose JSON-RPC result is written incrementally.
 *
 * Method-specific resources remain outside this adapter: `beforeFinish` can
 * commit them before the success envelope closes, while `onError` rolls them
 * back after serialization failures or client disconnects.
 */
export function streamJsonRpc(
  c: Context,
  options: StreamJsonRpcOptions,
  handler: JsonRpcStreamHandler
) {
  c.header('Content-Type', 'application/json; charset=UTF-8')

  return stream(c, async (output) => {
    const writer = new JsonRpcStreamWriter({
      chunkBytes: options.chunkBytes,
      id: options.id,
      output,
    })
    const methodStream = new JsonRpcMethodStreamController(writer)

    try {
      await handler(methodStream)
      writer.assertResultComplete()
      await methodStream.finishResources()
      await writer.finish()
    } catch (cause) {
      await methodStream.cleanup(cause)
      const errorResponse = options.handleError(cause)
      let errorResponseWritten = false
      if (!output.aborted) {
        try {
          errorResponseWritten = await writer.writeError(errorResponse)
        } catch {
          // The response cannot be recovered; abort it below.
        }
      }
      if (!(output.aborted || errorResponseWritten)) output.abort()
    }
  })
}

class JsonRpcMethodStreamController implements JsonRpcMethodStream {
  readonly writer: JsonRpcStreamWriter
  private readonly beforeFinishCallbacks: AsyncCallback[] = []
  private readonly errorCallbacks: ErrorCallback[] = []

  constructor(writer: JsonRpcStreamWriter) {
    this.writer = writer
  }

  result(value: unknown) {
    return this.writer.result(value)
  }

  resultArray(write: WriteScope<JsonArrayStreamWriter>) {
    return this.writer.resultArray(write)
  }

  resultObject(write: WriteScope<JsonObjectStreamWriter>) {
    return this.writer.resultObject(write)
  }

  beforeFinish(callback: AsyncCallback) {
    this.beforeFinishCallbacks.push(callback)
  }

  onError(callback: ErrorCallback) {
    this.errorCallbacks.push(callback)
  }

  async finishResources() {
    for (const callback of this.beforeFinishCallbacks) await callback()
  }

  async cleanup(cause: unknown) {
    for (let index = this.errorCallbacks.length - 1; index >= 0; index--) {
      try {
        await this.errorCallbacks[index]?.(cause)
      } catch {
        // Continue running the remaining cleanup callbacks.
      }
    }
  }
}

/**
 * Structured, bounded JSON-RPC success-response serializer.
 *
 * Use nested array/object scopes for large values. Passing a whole value to
 * `result` or `value` intentionally uses normal `JSON.stringify` semantics and
 * therefore buffers that individual value only.
 */
export class JsonRpcStreamWriter {
  private readonly id: JsonRpcId
  private readonly output: BufferedJsonOutput
  private envelopeStarted = false
  private resultComplete = false
  private finished = false

  constructor(args: {
    id: JsonRpcId
    output: JsonRpcOutputStream
    chunkBytes?: number
  }) {
    this.id = args.id
    this.output = new BufferedJsonOutput(
      args.output,
      args.chunkBytes ?? DEFAULT_JSON_CHUNK_BYTES
    )
  }

  async result(value: unknown) {
    await this.beginResult()
    await this.output.append(stringifyRootValue(value))
    this.resultComplete = true
  }

  async resultArray(write: WriteScope<JsonArrayStreamWriter>) {
    await this.beginResult()
    const array = new JsonArrayStreamWriter(this.output)
    await array.open()
    await write(array)
    await array.close()
    this.resultComplete = true
  }

  async resultObject(write: WriteScope<JsonObjectStreamWriter>) {
    await this.beginResult()
    const object = new JsonObjectStreamWriter(this.output)
    await object.open()
    await write(object)
    await object.close()
    this.resultComplete = true
  }

  assertResultComplete() {
    if (!this.resultComplete) {
      throw new JsonRpcStreamStateError(
        'JSON-RPC stream did not write a result'
      )
    }
  }

  async finish() {
    this.assertResultComplete()
    if (this.finished) {
      throw new JsonRpcStreamStateError('JSON-RPC stream is already finished')
    }
    this.finished = true
    await this.output.append('}')
    await this.output.flush()
  }

  async writeError(response: JsonRpcErrorResponse): Promise<boolean> {
    if (this.output.flushed || this.output.aborted) return false
    this.output.reset()
    this.envelopeStarted = true
    this.resultComplete = true
    this.finished = true
    await this.output.append(
      stringifyJson(response, 'JSON-RPC error response is not serializable')
    )
    await this.output.flush()
    return true
  }

  private async beginResult() {
    if (this.finished) {
      throw new JsonRpcStreamStateError('JSON-RPC stream is already finished')
    }
    if (this.envelopeStarted) {
      throw new JsonRpcStreamStateError('JSON-RPC stream already has a result')
    }
    this.envelopeStarted = true
    await this.output.append(
      `{"jsonrpc":"2.0","id":${JSON.stringify(this.id)},"result":`
    )
  }
}

export class JsonArrayStreamWriter {
  private readonly output: BufferedJsonOutput
  private first = true
  private opened = false
  private closed = false

  constructor(output: BufferedJsonOutput) {
    this.output = output
  }

  async value(value: unknown) {
    const encoded = stringifyArrayValue(value)
    await this.output.append(`${this.valuePrefix()}${encoded}`)
  }

  async array(write: WriteScope<JsonArrayStreamWriter>) {
    const array = new JsonArrayStreamWriter(this.output)
    await array.open(this.valuePrefix())
    await write(array)
    await array.close()
  }

  async object(write: WriteScope<JsonObjectStreamWriter>) {
    const object = new JsonObjectStreamWriter(this.output)
    await object.open(this.valuePrefix())
    await write(object)
    await object.close()
  }

  async open(prefix = '') {
    if (this.opened) {
      throw new JsonRpcStreamStateError('JSON array stream is already open')
    }
    this.opened = true
    await this.output.append(`${prefix}[`)
  }

  async close() {
    this.assertOpen()
    this.closed = true
    await this.output.append(']')
  }

  private valuePrefix() {
    this.assertOpen()
    const prefix = this.first ? '' : ','
    this.first = false
    return prefix
  }

  private assertOpen() {
    if (!this.opened) {
      throw new JsonRpcStreamStateError('JSON array stream is not open')
    }
    if (this.closed) {
      throw new JsonRpcStreamStateError('JSON array stream is closed')
    }
  }
}

export class JsonObjectStreamWriter {
  private readonly output: BufferedJsonOutput
  private first = true
  private opened = false
  private closed = false

  constructor(output: BufferedJsonOutput) {
    this.output = output
  }

  async value(name: string, value: unknown) {
    const encoded = stringifyJson(
      value,
      'JSON-RPC object value is not serializable'
    )
    if (encoded === undefined) return
    await this.output.append(`${this.propertyPrefix(name)}${encoded}`)
  }

  async values(values: Record<string, unknown>) {
    for (const [name, value] of Object.entries(values)) {
      await this.value(name, value)
    }
  }

  async array(name: string, write: WriteScope<JsonArrayStreamWriter>) {
    const array = new JsonArrayStreamWriter(this.output)
    await array.open(this.propertyPrefix(name))
    await write(array)
    await array.close()
  }

  async object(name: string, write: WriteScope<JsonObjectStreamWriter>) {
    const object = new JsonObjectStreamWriter(this.output)
    await object.open(this.propertyPrefix(name))
    await write(object)
    await object.close()
  }

  async open(prefix = '') {
    if (this.opened) {
      throw new JsonRpcStreamStateError('JSON object stream is already open')
    }
    this.opened = true
    await this.output.append(`${prefix}{`)
  }

  async close() {
    this.assertOpen()
    this.closed = true
    await this.output.append('}')
  }

  private propertyPrefix(name: string) {
    this.assertOpen()
    const prefix = this.first ? '' : ','
    this.first = false
    return `${prefix}${JSON.stringify(name)}:`
  }

  private assertOpen() {
    if (!this.opened) {
      throw new JsonRpcStreamStateError('JSON object stream is not open')
    }
    if (this.closed) {
      throw new JsonRpcStreamStateError('JSON object stream is closed')
    }
  }
}

class BufferedJsonOutput {
  private readonly chunkBytes: number
  private readonly output: JsonRpcOutputStream
  private buffer = ''
  private hasFlushed = false

  constructor(output: JsonRpcOutputStream, chunkBytes: number) {
    if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0) {
      throw new JsonRpcStreamStateError(
        'JSON stream chunk bytes must be a positive integer'
      )
    }
    this.output = output
    this.chunkBytes = chunkBytes
  }

  get flushed() {
    return this.hasFlushed
  }

  get aborted() {
    return this.output.aborted
  }

  reset() {
    if (this.hasFlushed) {
      throw new JsonRpcStreamStateError(
        'cannot reset JSON-RPC output after flushing a chunk'
      )
    }
    this.buffer = ''
  }

  async append(value: string) {
    this.assertOpen()
    this.buffer += value
    if (this.buffer.length >= this.chunkBytes) await this.flush()
  }

  async flush() {
    if (this.buffer.length === 0) return
    this.assertOpen()
    const value = this.buffer
    this.buffer = ''
    await this.output.write(value)
    this.assertOpen()
    this.hasFlushed = true
  }

  private assertOpen() {
    if (this.output.aborted) {
      throw new JsonRpcStreamStateError('JSON-RPC output aborted')
    }
  }
}

function stringifyRootValue(value: unknown) {
  const encoded = stringifyJson(value, 'JSON-RPC result is not serializable')
  if (encoded === undefined) {
    throw new JsonRpcSerializationError(
      'JSON-RPC result is not JSON serializable'
    )
  }
  return encoded
}

function stringifyArrayValue(value: unknown) {
  return (
    stringifyJson(value, 'JSON-RPC array value is not serializable') ?? 'null'
  )
}

function stringifyJson(value: unknown, message: string) {
  try {
    return JSON.stringify(value)
  } catch (cause) {
    throw new JsonRpcSerializationError(message, cause)
  }
}
