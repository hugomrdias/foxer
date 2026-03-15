import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'
import { type Connector, useConnect, useConnectors } from 'wagmi'
import { filecoin, filecoinCalibration } from 'wagmi/chains'

import { store } from '@/lib/store.ts'

import { Button } from './ui/button.tsx'

export function ConnectOptions() {
  const connectors = useConnectors()
  const { network } = useStore(store, { keys: ['network'] })
  const { mutate: connect, isPending } = useConnect()

  return connectors.map((connector) => {
    if (connector.id === 'injected') {
      return null
    }
    return (
      <WalletOption
        connector={connector}
        isPending={isPending}
        key={connector.uid}
        onClick={() => {
          connect({
            connector,
            chainId:
              network === 'mainnet' ? filecoin.id : filecoinCalibration.id,
          })
        }}
      />
    )
  })
}

function WalletOption({
  connector,
  onClick,
  isPending,
}: {
  connector: Connector
  onClick: () => void
  isPending: boolean
}) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void (async () => {
      const provider = await connector.getProvider()
      setReady(!!provider)
    })()
  }, [connector])

  return (
    <Button disabled={!ready || isPending} onClick={onClick} type="button">
      {connector.name}
    </Button>
  )
}
