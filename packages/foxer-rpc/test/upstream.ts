import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'

export const upstreamRpcUrl = 'http://upstream.test/rpc'
export const realtimeRpcUrl = 'http://realtime.test/rpc'
export const server = setupServer()

export type RpcRequest = {
  id: number | string
  jsonrpc: '2.0'
  method: string
  params?: unknown[]
}

type RpcResult = unknown | ((request: RpcRequest) => unknown | Promise<unknown>)

export function mockUpstreamRpc(
  methods: Record<string, RpcResult>,
  options: { url?: string; requests?: RpcRequest[] } = {}
) {
  const requests = options.requests ?? []
  server.use(
    http.post(options.url ?? upstreamRpcUrl, async ({ request }) => {
      const body = (await request.json()) as RpcRequest | RpcRequest[]
      const items = Array.isArray(body) ? body : [body]
      const responses = await Promise.all(
        items.map(async (item) => {
          requests.push(item)
          const handler = methods[item.method]
          if (handler === undefined) {
            return {
              jsonrpc: '2.0',
              id: item.id,
              error: {
                code: -32601,
                message: `Unhandled method ${item.method}`,
              },
            }
          }
          try {
            const result =
              typeof handler === 'function' ? await handler(item) : handler
            if (
              result &&
              typeof result === 'object' &&
              'error' in result &&
              Object.keys(result).length === 1
            ) {
              return { jsonrpc: '2.0', id: item.id, ...result }
            }
            return { jsonrpc: '2.0', id: item.id, result }
          } catch (error) {
            return {
              jsonrpc: '2.0',
              id: item.id,
              error: { code: -32_000, message: String(error) },
            }
          }
        })
      )
      return HttpResponse.json(Array.isArray(body) ? responses : responses[0])
    })
  )
  return requests
}
