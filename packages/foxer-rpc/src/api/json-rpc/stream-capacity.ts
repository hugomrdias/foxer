import {
  JsonRpcConfigurationError,
  StreamCapacityExceededError,
} from './errors.ts'

export { StreamCapacityExceededError } from './errors.ts'

export type StreamCapacityPermit = {
  release: () => void
}

/**
 * Caps the number of streamed requests allowed to hold API pool connections.
 *
 * Acquisition is synchronous so the active-count check and increment cannot be
 * interleaved by another request on the JavaScript event loop.
 */
export class StreamCapacityLimiter {
  readonly maxStreamConnections: number
  private activeStreamConnections = 0

  constructor(maxStreamConnections: number) {
    if (
      !Number.isSafeInteger(maxStreamConnections) ||
      maxStreamConnections < 1
    ) {
      throw new JsonRpcConfigurationError(
        'max stream connections must be a positive integer'
      )
    }
    this.maxStreamConnections = maxStreamConnections
  }

  get active() {
    return this.activeStreamConnections
  }

  acquire(): StreamCapacityPermit {
    if (this.activeStreamConnections >= this.maxStreamConnections) {
      throw new StreamCapacityExceededError({
        activeStreamConnections: this.activeStreamConnections,
        maxStreamConnections: this.maxStreamConnections,
      })
    }

    this.activeStreamConnections += 1
    let released = false
    return {
      release: () => {
        if (released) return
        released = true
        this.activeStreamConnections -= 1
      },
    }
  }
}
