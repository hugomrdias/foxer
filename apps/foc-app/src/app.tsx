import { useConnection } from 'wagmi'

import { Toaster } from '@/components/ui/sonner.tsx'

import { ConnectSection } from './components/connect-section'
import { Connected } from './components/connected'
import * as Icons from './components/icons'
import { NetworkSelector } from './components/network-selector'
export function App() {
  const { isConnected } = useConnection()
  return (
    <div>
      <header>
        <nav
          aria-label="Global"
          className="mx-auto flex max-w-7xl items-center justify-between p-6 lg:px-8"
        >
          <div className="flex flex-row gap-2 items-center">
            <a className="" href="/">
              <Icons.Filecoin className="w-8 h-8" />
            </a>
            <span className="text-xl font-bold">Foxer</span>
          </div>
          <div className="flex flex-row gap-3 items-center">
            <NetworkSelector />
          </div>
        </nav>
      </header>
      <main>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {isConnected && <Connected />}
          {!isConnected && <ConnectSection />}
        </div>
      </main>
      <Toaster richColors={true} theme="system" />
    </div>
  )
}

export default App
