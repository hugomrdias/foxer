import type { MethodContext } from '../types.ts'

export function netVersion(args: MethodContext) {
  return String(args.config.chainId)
}
