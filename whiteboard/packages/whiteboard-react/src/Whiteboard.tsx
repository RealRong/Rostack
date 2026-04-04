import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import type { WhiteboardProps } from './types/common/board'
import { EditorProvider } from './runtime/hooks/useEditor'
import { EnvironmentProvider } from './runtime/hooks/useEnvironment'
import { HostProvider } from './runtime/hooks/useHost'
import type { WhiteboardInstance as Editor } from './types/runtime'
import { Surface } from './canvas/Surface'
import { DocumentSync } from './runtime/whiteboard/DocumentSync'
import { CollabLifecycle } from './runtime/whiteboard/CollabLifecycle'
import { EditorLifecycle } from './runtime/whiteboard/EditorLifecycle'
import { HostLifecycle } from './runtime/whiteboard/HostLifecycle'
import { useWhiteboardConfig } from './runtime/whiteboard/config'
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
    hostConfig
  } = useWhiteboardConfig(options)
  const {
    editor,
    registry,
    host,
    engine,
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
  const environment = useMemo(
    () => ({
      registry,
      config: resolvedConfig
    }),
    [registry, resolvedConfig]
  )

  useImperativeHandle(ref, () => editor, [editor])

  return (
    <EnvironmentProvider value={environment}>
      <EditorProvider value={editor}>
        <HostProvider value={host}>
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
          <HostLifecycle
            host={host}
            hostConfig={hostConfig}
          />
          <EditorLifecycle
            editor={editor}
            editorConfig={editorConfig}
          />
          <Surface
            resolvedConfig={resolvedConfig}
            containerRef={containerRef}
            containerStyle={resolvedConfig.style}
          />
        </HostProvider>
      </EditorProvider>
    </EnvironmentProvider>
  )
})

export const Whiteboard = WhiteboardInner
