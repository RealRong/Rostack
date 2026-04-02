import { createContext, useContext } from 'react'
import type { WhiteboardHostRuntime } from '../host/runtime'

const HostContext = createContext<WhiteboardHostRuntime | null>(null)

export const HostProvider = HostContext.Provider

export const useHostRuntime = (): WhiteboardHostRuntime => {
  const host = useContext(HostContext)
  if (!host) {
    throw new Error('Whiteboard host runtime is not initialized')
  }
  return host
}
