import { Wallet02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty.tsx'

import { ConnectWallet } from './connect-wallet.tsx'
export function ConnectSection() {
  return (
    <div>
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Wallet02Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>Foc App</EmptyTitle>
          <EmptyDescription>
            Connect your wallet to get started.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex gap-2">
            <ConnectWallet />
          </div>
        </EmptyContent>
      </Empty>
    </div>
  )
}
