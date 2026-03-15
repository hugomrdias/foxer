import { useEffect, useState } from 'react'
import { useConnection } from 'wagmi'

import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.tsx'

import { ConnectOptions } from './connect-options.tsx'

export function ConnectWallet() {
  const [open, setOpen] = useState(false)
  const { isConnected } = useConnection()

  useEffect(() => {
    if (isConnected) {
      setOpen(false)
    }
  }, [isConnected])

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger render={<Button>Connect</Button>} />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Connect your wallet to get started
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <ConnectOptions />
        </div>
      </DialogContent>
    </Dialog>
  )
}
