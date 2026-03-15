import { calibration } from '@filoz/synapse-core/chains'
import type { PDPOffering } from '@filoz/synapse-core/sp-registry'
import {
  capabilitiesListToObject,
  decodePDPCapabilities,
} from '@filoz/synapse-core/utils'
import { eq } from 'drizzle-orm'
import { decodeFunctionData } from 'viem'

import type { Registry } from '../../foxer.config.ts'
import { schema } from '../schema/index.ts'

// TODO add contract to the context

export function handleProviders(registry: Registry) {
  registry.on(
    'serviceProviderRegistry:ProviderRegistered',
    async ({ context, event }) => {
      context.logger.silent({ event: event.args }, 'ProviderRegistered')
      const args = event.args

      const decoded = decodeRegisterProvider(
        event.transaction.input as `0x${string}`
      )

      await context.db
        .insert(schema.providers)
        .values({
          providerId: args.providerId,
          serviceProvider: args.serviceProvider,
          payee: args.payee,
          description: decoded.description,
          name: decoded.name,
          serviceURL: decoded.capabilities?.serviceURL,
          minPieceSizeInBytes: decoded.capabilities?.minPieceSizeInBytes,
          storagePricePerTibPerDay:
            decoded.capabilities?.storagePricePerTibPerDay,
          minProvingPeriodInEpochs:
            decoded.capabilities?.minProvingPeriodInEpochs,
          location: decoded.capabilities?.location,
          paymentTokenAddress: decoded.capabilities?.paymentTokenAddress,
          blockNumber: event.block.number,
          createdAt: event.block.timestamp,
          updatedAt: event.block.timestamp,
          productType: decoded.productType,
        })
        .onConflictDoNothing()
    }
  )

  registry.on(
    'serviceProviderRegistry:ProviderRemoved',
    async ({ context, event }) => {
      context.logger.silent({ event: event.args }, 'ProviderRemoved')
      const args = event.args
      await context.db
        .delete(schema.providers)
        .where(eq(schema.providers.providerId, args.providerId))
    }
  )

  registry.on(
    'serviceProviderRegistry:ProviderInfoUpdated',
    async ({ context, event }) => {
      context.logger.silent({ event: event.args }, 'ProviderInfoUpdated')
      const args = event.args

      const decoded = decodeUpdateProviderInfo(
        event.transaction.input as `0x${string}`
      )
      if (!decoded) {
        context.logger.error(
          { event: event.args },
          'ProviderInfoUpdated: Invalid transaction input'
        )
        return
      }

      await context.db
        .update(schema.providers)
        .set({
          name: decoded.name,
          description: decoded.description,
        })
        .where(eq(schema.providers.providerId, args.providerId))
    }
  )

  registry.on(
    'serviceProviderRegistry:ProductUpdated',
    async ({ context, event }) => {
      context.logger.silent({ event: event.args }, 'ProductUpdated')
      const args = event.args

      const capabilities = decodePDPCapabilities(
        capabilitiesListToObject(args.capabilityKeys, args.capabilityValues)
      )
      await context.db
        .update(schema.providers)
        .set({
          serviceURL: capabilities.serviceURL,
          maxPieceSizeInBytes: capabilities.maxPieceSizeInBytes,
          minPieceSizeInBytes: capabilities.minPieceSizeInBytes,
          storagePricePerTibPerDay: capabilities.storagePricePerTibPerDay,
          minProvingPeriodInEpochs: capabilities.minProvingPeriodInEpochs,
          location: capabilities.location,
          paymentTokenAddress: capabilities.paymentTokenAddress,
          updatedAt: event.block.timestamp,
          createdAt: event.block.timestamp,
        })
        .where(eq(schema.providers.providerId, args.providerId))
    }
  )
}

function decodeRegisterProvider(input: `0x${string}`) {
  const { args } = decodeFunctionData({
    abi: calibration.contracts.serviceProviderRegistry.abi,
    data: input,
  })

  let capabilities: PDPOffering | undefined

  if (args[4] && args[5]) {
    const capabilitiesObject = capabilitiesListToObject(args[4], args[5])
    capabilities = decodePDPCapabilities(capabilitiesObject)
  }

  return {
    name: args[1] as string,
    description: args[2] as string,
    productType: args[3] as number,
    capabilities,
  }
}

function decodeUpdateProviderInfo(input: `0x${string}`) {
  const abi = calibration.contracts.serviceProviderRegistry.abi.find(
    (abi) => abi.type === 'function' && abi.name === 'updateProviderInfo'
  )
  if (!abi) {
    return undefined
  }
  const { functionName, args } = decodeFunctionData({
    abi: [abi],
    data: input,
  })

  if (functionName !== 'updateProviderInfo') {
    return undefined
  }

  return {
    name: args[0],
    description: args[1],
  }
}
