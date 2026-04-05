import { useMemo, useRef } from 'react'
import type { BoardConfig as EngineBoardConfig } from '@whiteboard/core/config'
import type { Document } from '@whiteboard/core/types'
import { createEngine, normalizeDocument } from '@whiteboard/engine'
import { createDefaultNodeRegistry } from '../../features/node/registry'
import { DEFAULT_DRAW_PREFERENCES } from '../../features/toolbox/drawPreferences'
import { INSERT_PRESET_CATALOG } from '../../features/toolbox/presets'
import type { WhiteboardProps } from '../../types/common/board'
import type { ResolvedConfig } from '../../types/common/config'
import { createClipboardBridge } from '../bridge/clipboard'
import { createInsertBridge } from '../bridge/insert'
import { createPointerBridge } from '../bridge/pointer'
import { createClipboardHostAdapter } from '../../dom/host/clipboard'
import { createEditor } from '../editor'
import type { WhiteboardServicesContextValue } from '../hooks/useWhiteboard'

type WhiteboardServices = WhiteboardServicesContextValue

export const isMirroredDocumentFromEngine = (
  outbound: Document,
  inbound: Document
) => (
  outbound.id === inbound.id
  && outbound.name === inbound.name
  && outbound.nodes === inbound.nodes
  && outbound.edges === inbound.edges
  && outbound.background === inbound.background
  && outbound.meta === inbound.meta
)

export const useWhiteboardRuntime = ({
  document,
  onDocumentChange,
  coreRegistries,
  nodeRegistry,
  resolvedConfig,
  boardConfig
}: Pick<WhiteboardProps, 'document' | 'onDocumentChange' | 'coreRegistries' | 'nodeRegistry'> & {
  resolvedConfig: ResolvedConfig
  boardConfig: EngineBoardConfig
}) => {
  const inputDocument = useMemo(
    () => normalizeDocument(document, boardConfig),
    [document, boardConfig]
  )
  const onDocumentChangeRef = useRef(onDocumentChange)
  const lastOutboundDocumentRef = useRef<Document>(inputDocument)
  const registryRef = useRef(nodeRegistry ?? createDefaultNodeRegistry())

  onDocumentChangeRef.current = onDocumentChange

  const engineRef = useRef<WhiteboardServices['engine'] | null>(null)
  if (!engineRef.current) {
    engineRef.current = createEngine({
      registries: coreRegistries,
      document: inputDocument,
      onDocumentChange: (nextDocument) => {
        lastOutboundDocumentRef.current = nextDocument
        onDocumentChangeRef.current(nextDocument)
      },
      config: boardConfig
    })
  }
  const engine = engineRef.current!

  const editorRef = useRef<WhiteboardServices['editor'] | null>(null)
  if (!editorRef.current) {
    editorRef.current = createEditor({
      engine,
      initialTool: resolvedConfig.initialTool,
      initialDrawPreferences: DEFAULT_DRAW_PREFERENCES,
      initialViewport: resolvedConfig.viewport.initial,
      registry: registryRef.current,
    })
  }
  const editor = editorRef.current!

  const servicesRef = useRef<WhiteboardServices | null>(null)
  if (!servicesRef.current) {
    const insert = createInsertBridge({
      editor,
      catalog: INSERT_PRESET_CATALOG
    })
    const pointer = createPointerBridge({
      editor,
      insert
    })
    const clipboard = createClipboardBridge({
      editor,
      adapter: createClipboardHostAdapter(),
      readPointer: pointer.getWorld
    })

    servicesRef.current = {
      editor,
      engine,
      registry: registryRef.current,
      pointer,
      clipboard,
      insert
    }
  }
  const services = servicesRef.current!

  return {
    services,
    inputDocument,
    lastOutboundDocumentRef,
    onDocumentChangeRef
  }
}
