/** biome-ignore-all lint/style/noNonNullAssertion: its ok */

import { calibration, mainnet } from '@filoz/synapse-core/chains'
import { createClient } from '@hugomrdias/foxer-client'
import { FoxerProvider } from '@hugomrdias/foxer-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { createRoot } from 'react-dom/client'
import { createConfig, http, WagmiProvider } from 'wagmi'

import './index.css'
import { injected } from 'wagmi/connectors'

import { Schema } from '../../api/src/index.ts'
import App from './app.tsx'
import { ThemeProvider } from './components/theme-provider.tsx'

const queryClient = new QueryClient()

export const config = createConfig({
  chains: [mainnet, calibration],
  connectors: [injected()],
  transports: {
    [mainnet.id]: http(),
    [calibration.id]: http(undefined, {
      batch: false,
    }),
  },
  batch: {
    multicall: false,
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}

declare module '@hugomrdias/foxer-react' {
  interface Register {
    schema: typeof Schema.schema
    relations: typeof Schema.relations
  }
}

const foxer = createClient({
  baseUrl: 'http://localhost:4200/sql',
  relations: Schema.relations,
  schema: Schema.schema,
})

createRoot(document.getElementById('root')!).render(
  // <StrictMode>
  <ThemeProvider defaultTheme="system" storageKey="foc-app-theme">
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <FoxerProvider client={foxer}>
          <NuqsAdapter>
            <App />
          </NuqsAdapter>
        </FoxerProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </ThemeProvider>
  // </StrictMode>
)
