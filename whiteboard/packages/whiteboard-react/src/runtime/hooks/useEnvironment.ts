import { createContext, useContext } from 'react'
import type { ResolvedConfig } from '../../types/common/config'
import type { NodeRegistry } from '../../types/node'

type WhiteboardEnvironment = {
  registry: NodeRegistry
  config: ResolvedConfig
}

const EnvironmentContext = createContext<WhiteboardEnvironment | null>(null)

export const EnvironmentProvider = EnvironmentContext.Provider

const useEnvironment = (): WhiteboardEnvironment => {
  const environment = useContext(EnvironmentContext)
  if (!environment) {
    throw new Error('Whiteboard environment is not initialized')
  }
  return environment
}

export const useNodeRegistry = (): NodeRegistry => useEnvironment().registry

export const useResolvedConfig = (): ResolvedConfig => useEnvironment().config
