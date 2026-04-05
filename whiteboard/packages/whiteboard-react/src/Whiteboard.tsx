import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import type { WhiteboardProps } from './types/common/board'
import { resolveConfig } from './config'
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
import { useWhiteboardRuntime } from './runtime/whiteboard/runtime'

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
  const {
    services,
    inputDocument,
    lastOutboundDocumentRef,
    onDocumentChangeRef
  } = useWhiteboardRuntime({
    document,
    onDocumentChange,
    coreRegistries,
    nodeRegistry,
    resolvedConfig,
    boardConfig
  })
  const editor = services.editor
  const engine = services.engine

  useImperativeHandle(ref, () => editor, [editor])

  return (
    <WhiteboardServicesProvider value={services}>
      <WhiteboardConfigProvider value={resolvedConfig}>
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
      </WhiteboardConfigProvider>
    </WhiteboardServicesProvider>
  )
})

export const Whiteboard = WhiteboardInner
