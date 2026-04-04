import { createContext, useContext } from 'react'
import type { NodeRegistry } from '../../types/node'
import type { ResolvedConfig } from '../../types/common/config'
import type { WhiteboardRuntime } from '../../types/runtime'
import type { ClipboardBridge } from '../bridge/clipboard'
import type { InsertBridge } from '../bridge/insert'
import type { PointerBridge } from '../bridge/pointer'
import { EngineInstance } from '@whiteboard/engine'

export type WhiteboardContextValue = {
  editor: WhiteboardRuntime
  engine: EngineInstance
  registry: NodeRegistry
  config: ResolvedConfig
  pointer: PointerBridge
  clipboard: ClipboardBridge
  insert: InsertBridge
}

const WhiteboardContext = createContext<WhiteboardContextValue | null>(null)

export const WhiteboardProvider = WhiteboardContext.Provider

export const useWhiteboard = (): WhiteboardContextValue => {
  const whiteboard = useContext(WhiteboardContext)
  if (!whiteboard) {
    throw new Error('Whiteboard runtime is not initialized')
  }
  return whiteboard
}

export const useNodeRegistry = (): NodeRegistry => useWhiteboard().registry

export const useResolvedConfig = (): ResolvedConfig => useWhiteboard().config
