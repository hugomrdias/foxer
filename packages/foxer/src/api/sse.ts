import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'

export function sseError(c: Context, message: string) {
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: 'error',
      data: message,
    })
    return stream.close()
  })
}
