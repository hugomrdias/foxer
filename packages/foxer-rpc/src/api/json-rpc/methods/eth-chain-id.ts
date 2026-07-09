import { quantity } from '../../decode.ts'
import type { MethodContext } from '../types.ts'

export function ethChainId(args: MethodContext) {
  return quantity(args.config.chainId)
}
