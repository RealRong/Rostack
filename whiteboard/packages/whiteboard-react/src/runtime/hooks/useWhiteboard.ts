import { createContext, useContext, useMemo } from 'react'
import type { ResolvedConfig } from '@whiteboard/react/types/common/config'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'
import type { ClipboardBridge } from '@whiteboard/react/runtime/bridge/clipboard'
import type { InsertBridge } from '@whiteboard/react/runtime/bridge/insert'
import type { PointerBridge } from '@whiteboard/react/runtime/bridge/pointer'
import type { Engine } from '@whiteboard/engine'
import type { TextSourceStore } from '@whiteboard/react/features/node/dom/textSourceStore'
import { compileReactNodeSpec } from '@whiteboard/react/features/node/registry/compile'
import type { WhiteboardSpec } from '@whiteboard/react/types/spec'

export type WhiteboardServicesContextValue = {
  editor: WhiteboardRuntime
  engine: Engine
  spec: WhiteboardSpec
  nodes: ReturnType<typeof compileReactNodeSpec>
  textSources: TextSourceStore
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

export const useNodeSpec = () => useWhiteboardServices().nodes
