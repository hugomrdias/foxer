import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'

import { InvalidParamsError } from '../src/api/json-rpc/errors.ts'
import {
  type JsonArrayStreamWriter,
  type JsonRpcOutputStream,
  JsonRpcStreamWriter,
  streamJsonRpc,
} from '../src/api/json-rpc/stream.ts'
import { handleTestJsonRpcFailure } from './helpers.ts'

describe('JsonRpcStreamWriter', () => {
  test('writes nested arrays and objects with JSON.stringify semantics', async () => {
    const output = createOutput()
    const writer = new JsonRpcStreamWriter({
      chunkBytes: 8,
      id: 'request',
      output,
    })

    await writer.resultObject(async (result) => {
      await result.values({ ok: true, skipped: undefined })
      await result.array('items', async (items) => {
        await items.value(1)
        await items.value(undefined)
        await items.object(async (item) => {
          await item.value('quoted"key', 'value')
        })
      })
    })
    await writer.finish()

    expect(output.body).toBe(
      '{"jsonrpc":"2.0","id":"request","result":{"ok":true,"items":[1,null,{"quoted\\"key":"value"}]}}'
    )
  })

  test('writes scalar results and rejects a second root result', async () => {
    const output = createOutput()
    const writer = new JsonRpcStreamWriter({ id: null, output })

    await writer.result('ok')
    await expect(writer.result([])).rejects.toThrow(
      'JSON-RPC stream already has a result'
    )
    await writer.finish()

    expect(JSON.parse(output.body)).toEqual({
      jsonrpc: '2.0',
      id: null,
      result: 'ok',
    })
  })

  test('rejects unsupported root values and writes undefined array values as null', async () => {
    const invalid = new JsonRpcStreamWriter({ id: 1, output: createOutput() })
    await expect(invalid.result(undefined)).rejects.toThrow(
      'JSON-RPC result is not JSON serializable'
    )

    const output = createOutput()
    const writer = new JsonRpcStreamWriter({ id: 1, output })
    await writer.resultArray(async (values) => {
      await expect(values.value(1n)).rejects.toThrow()
      await values.value(undefined)
      await values.value('valid')
    })
    await writer.finish()
    expect(JSON.parse(output.body).result).toEqual([null, 'valid'])
  })

  test('rejects writes through a closed nested scope', async () => {
    const output = createOutput()
    const writer = new JsonRpcStreamWriter({ id: 1, output })
    const captured: { value?: JsonArrayStreamWriter } = {}

    await writer.resultArray(async (values) => {
      captured.value = values
      await values.value('first')
    })
    await writer.finish()

    if (!captured.value) throw new Error('expected captured array writer')
    await expect(captured.value.value('late')).rejects.toThrow(
      'JSON array stream is closed'
    )
  })

  test('detects aborts even when the Hono-style output swallows write errors', async () => {
    const output = createOutput({ abortOnWrite: true })
    const writer = new JsonRpcStreamWriter({ chunkBytes: 1, id: 1, output })

    await expect(writer.result('value')).rejects.toThrow(
      'JSON-RPC output aborted'
    )
    expect(output.aborted).toBe(true)
  })
})

describe('streamJsonRpc', () => {
  test('integrates structured results and lifecycle hooks with Hono', async () => {
    const events: string[] = []
    const app = new Hono()
    app.get('/', (c) =>
      streamJsonRpc(c, streamOptions(7), async (stream) => {
        stream.beforeFinish(() => {
          events.push('commit')
        })
        stream.onError(() => {
          events.push('rollback')
        })
        events.push('write')
        await stream.resultArray(async (values) => {
          await values.value('a')
          await values.value('b')
        })
      })
    )

    const response = await app.request('/')
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: 7,
      result: ['a', 'b'],
    })
    expect(events).toEqual(['write', 'commit'])
  })

  test('runs error cleanup and aborts incomplete responses', async () => {
    const events: string[] = []
    const app = new Hono()
    app.get('/', (c) =>
      streamJsonRpc(
        c,
        { ...streamOptions(8), chunkBytes: 1 },
        async (stream) => {
          stream.beforeFinish(() => {
            events.push('commit')
          })
          stream.onError(() => {
            events.push('first cleanup')
          })
          stream.onError(() => {
            events.push('second cleanup')
          })
          await stream.resultArray(async (values) => {
            await values.value('partial')
            throw new Error('stream failed')
          })
        }
      )
    )

    const response = await app.request('/')
    await response.text()
    expect(events).toEqual(['second cleanup', 'first cleanup'])
  })

  test('replaces an unflushed result with a JSON-RPC error', async () => {
    const events: string[] = []
    const app = new Hono()
    app.get('/', (c) =>
      streamJsonRpc(c, streamOptions(9), (stream) => {
        stream.onError(() => {
          events.push('cleanup')
        })
        throw new InvalidParamsError('invalid stream params')
      })
    )

    const response = await app.request('/')
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: 9,
      error: { code: -32602, message: 'invalid stream params' },
    })
    expect(events).toEqual(['cleanup'])
  })

  test('maps unexpected unflushed failures to internal errors', async () => {
    const app = new Hono()
    app.get('/', (c) =>
      streamJsonRpc(c, streamOptions(10), () => {
        throw new Error('database unavailable')
      })
    )

    const response = await app.request('/')
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: 10,
      error: { code: -32603, message: 'Internal error' },
    })
  })
})

function streamOptions(id: number) {
  return {
    handleError: (cause: unknown) => handleTestJsonRpcFailure(cause, { id }),
    id,
  }
}

function createOutput(
  options: { abortOnWrite?: boolean } = {}
): JsonRpcOutputStream & { readonly body: string } {
  let body = ''
  let abortListener: (() => void | Promise<void>) | undefined
  return {
    aborted: false,
    abort() {
      this.aborted = true
      void abortListener?.()
    },
    onAbort(listener: () => void | Promise<void>) {
      abortListener = listener
    },
    async write(value: string) {
      if (options.abortOnWrite) {
        this.aborted = true
        await abortListener?.()
        return
      }
      body += value
    },
    get body() {
      return body
    },
  }
}
