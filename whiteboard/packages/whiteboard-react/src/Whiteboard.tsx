import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import type { WhiteboardProps } from './types/common/board'
import { resolveConfig } from './config'
import { WhiteboardProvider } from './runtime/hooks/useWhiteboard'
import type { WhiteboardInstance as Editor } from './types/runtime'
import { Surface } from './canvas/Surface'
import { DocumentSync } from './runtime/whiteboard/DocumentSync'
import { CollabLifecycle } from './runtime/whiteboard/CollabLifecycle'
import { EditorLifecycle } from './runtime/whiteboard/EditorLifecycle'
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
    whiteboard,
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
  const editor = whiteboard.editor
  const engine = whiteboard.engine

  useImperativeHandle(ref, () => editor, [editor])

  return (
    <WhiteboardProvider value={whiteboard}>
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
      <EditorLifecycle
        editor={editor}
        editorConfig={editorConfig}
        viewportLimits={viewportLimits}
      />
      <Surface
        resolvedConfig={resolvedConfig}
        containerRef={containerRef}
        containerStyle={resolvedConfig.style}
      />
    </WhiteboardProvider>
  )
})

export const Whiteboard = WhiteboardInner
