import { useMemo, useRef } from 'react'
import type { BoardConfig as EngineBoardConfig } from '@whiteboard/core/config'
import type { Document } from '@whiteboard/core/types'
import { createEngine, normalizeDocument } from '@whiteboard/engine'
import { createDefaultNodeRegistry } from '../../features/node/registry'
import { DEFAULT_DRAW_PREFERENCES } from '../../features/toolbox/drawPreferences'
import { INSERT_PRESET_CATALOG } from '../../features/toolbox/presets'
import type { WhiteboardProps } from '../../types/common/board'
import type { ResolvedConfig } from '../../types/common/config'
import type { WhiteboardRuntime as Editor } from '../../types/runtime'
import { createEditor } from '../editor'
import { createHostRuntime } from '../host/runtime'

type EngineRuntime = ReturnType<typeof createEngine>

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

  const engineRef = useRef<EngineRuntime | null>(null)
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

  const hostRef = useRef<ReturnType<typeof createHostRuntime> | null>(null)
  if (!hostRef.current) {
    hostRef.current = createHostRuntime({
      insertPresetCatalog: INSERT_PRESET_CATALOG
    })
  }
  const host = hostRef.current

  const editorRef = useRef<Editor | null>(null)
  if (!editorRef.current) {
    editorRef.current = createEditor({
      engine,
      initialTool: resolvedConfig.initialTool,
      initialDrawPreferences: DEFAULT_DRAW_PREFERENCES,
      initialViewport: resolvedConfig.viewport.initial,
      registry: registryRef.current,
    })
    host.insert.bind(editorRef.current)
  }
  const editor = editorRef.current!

  return {
    editor,
    registry: registryRef.current,
    host,
    engine,
    inputDocument,
    lastOutboundDocumentRef,
    onDocumentChangeRef
  }
}
