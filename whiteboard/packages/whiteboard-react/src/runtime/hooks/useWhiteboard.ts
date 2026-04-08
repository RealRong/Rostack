import { createContext, useContext, useMemo } from 'react'
import type { NodeRegistry } from '#react/types/node'
import type { ResolvedConfig } from '../../types/common/config'
import type { WhiteboardRuntime } from '#react/types/runtime'
import type { ClipboardBridge } from '../bridge/clipboard'
import type { InsertBridge } from '../bridge/insert'
import type { PointerBridge } from '../bridge/pointer'
import type { EngineInstance } from '@whiteboard/engine'

export type WhiteboardServicesContextValue = {
  editor: WhiteboardRuntime
  engine: EngineInstance
  registry: NodeRegistry
  pointer: PointerBridge
  clipboard: ClipboardBridge
  insert: InsertBridge
}

export type WhiteboardContextValue = WhiteboardServicesContextValue & {
  config: ResolvedConfig
}

const WhiteboardServicesContext = createContext<WhiteboardServicesContextValue | null>(null)
const WhiteboardConfigContext = createContext<ResolvedConfig | null>(null)

export const WhiteboardServicesProvider = WhiteboardServicesContext.Provider
export const WhiteboardConfigProvider = WhiteboardConfigContext.Provider

export const useWhiteboardServices = (): WhiteboardServicesContextValue => {
  const services = useContext(WhiteboardServicesContext)
  if (!services) {
    throw new Error('Whiteboard runtime is not initialized')
  }
  return services
}

export const useResolvedConfig = (): ResolvedConfig => {
  const config = useContext(WhiteboardConfigContext)
  if (!config) {
    throw new Error('Whiteboard config is not initialized')
  }
  return config
}

export const useWhiteboard = (): WhiteboardContextValue => {
  const services = useWhiteboardServices()
  const config = useResolvedConfig()

  return useMemo(
    () => ({
      ...services,
      config
    }),
    [config, services]
  )
}

export const useNodeRegistry = (): NodeRegistry => useWhiteboardServices().registry
