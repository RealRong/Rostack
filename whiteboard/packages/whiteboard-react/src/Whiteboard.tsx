import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { OverlayProvider } from '@ui'
import type { Document } from '@whiteboard/core/types'
import { normalizeDocument } from '@whiteboard/engine'
import type { WhiteboardProps } from './types/common/board'
import { resolveConfig } from './config'
import { createDefaultNodeRegistry } from './features/node'
import {
  WhiteboardConfigProvider,
  WhiteboardServicesProvider
} from './runtime/hooks/useWhiteboard'
import type { WhiteboardInstance as Editor } from './types/runtime'
import { Surface } from './canvas/Surface'
import { DocumentSync } from './runtime/whiteboard/DocumentSync'
import { CollabLifecycle } from './runtime/whiteboard/CollabLifecycle'
import { EditorLifecycle } from './runtime/whiteboard/EditorLifecycle'
import { PresenceLifecycle } from './runtime/whiteboard/PresenceLifecycle'
import { createWhiteboardServices } from './runtime/whiteboard/services'

const WhiteboardInner = forwardRef<Editor | null, WhiteboardProps>(function WhiteboardInner(
  {
    document,
    onDocumentChange,
    coreRegistries,
    nodeRegistry,
    collab,
    options
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const {
    resolvedConfig,
    boardConfig,
    editorConfig,
    viewportLimits
  } = useMemo(
    () => resolveConfig(options),
    [options]
  )
  const inputDocument = useMemo(
    () => normalizeDocument(document, boardConfig),
    [document, boardConfig]
  )
  const onDocumentChangeRef = useRef(onDocumentChange)
  const lastOutboundDocumentRef = useRef<Document>(inputDocument)
  const registryRef = useRef(nodeRegistry ?? createDefaultNodeRegistry())
  const servicesRef = useRef<ReturnType<typeof createWhiteboardServices> | null>(null)

  onDocumentChangeRef.current = onDocumentChange

  if (!servicesRef.current) {
    servicesRef.current = createWhiteboardServices({
      document: inputDocument,
      onDocumentChange: (nextDocument) => {
        lastOutboundDocumentRef.current = nextDocument
        onDocumentChangeRef.current(nextDocument)
      },
      coreRegistries,
      registry: registryRef.current,
      resolvedConfig,
      boardConfig
    })
  }

  const services = servicesRef.current
  const editor = services.editor
  const engine = services.engine

  useImperativeHandle(ref, () => editor, [editor])

  return (
    <WhiteboardServicesProvider value={services}>
      <WhiteboardConfigProvider value={resolvedConfig}>
        <OverlayProvider>
          <DocumentSync
            editor={editor}
            document={document}
            inputDocument={inputDocument}
            lastOutboundDocumentRef={lastOutboundDocumentRef}
            onDocumentChangeRef={onDocumentChangeRef}
          />
          <CollabLifecycle
            collab={collab}
            engine={engine}
          />
          <PresenceLifecycle
            binding={collab?.presence?.binding}
            editor={editor}
            containerRef={containerRef}
          />
          <EditorLifecycle
            editor={editor}
            editorConfig={editorConfig}
            viewportLimits={viewportLimits}
          />
          <Surface
            resolvedConfig={resolvedConfig}
            containerRef={containerRef}
            containerStyle={resolvedConfig.style}
            presenceBinding={collab?.presence?.binding}
          />
        </OverlayProvider>
      </WhiteboardConfigProvider>
    </WhiteboardServicesProvider>
  )
})

export const Whiteboard = WhiteboardInner
