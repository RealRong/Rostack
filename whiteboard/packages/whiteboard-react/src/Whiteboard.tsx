import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { OverlayProvider } from '@shared/ui'
import type { WhiteboardProps } from '@whiteboard/react/types/common/board'
import { resolveConfig } from '@whiteboard/react/config'
import {
  WhiteboardConfigProvider,
  WhiteboardServicesProvider
} from '@whiteboard/react/runtime/hooks/useWhiteboard'
import type { WhiteboardInstance as Editor } from '@whiteboard/react/types/runtime'
import { Surface } from '@whiteboard/react/canvas/Surface'
import {
  useWhiteboardServices
} from '@whiteboard/react/runtime/whiteboard/useWhiteboardServices'
import {
  useWhiteboardDocumentSync
} from '@whiteboard/react/runtime/whiteboard/useWhiteboardDocumentSync'
import {
  useWhiteboardCollab
} from '@whiteboard/react/runtime/whiteboard/useWhiteboardCollab'
import {
  useWhiteboardPresence
} from '@whiteboard/react/runtime/whiteboard/useWhiteboardPresence'

const WhiteboardInner = forwardRef<Editor | null, WhiteboardProps>(function WhiteboardInner(
  {
    document,
    onDocumentChange,
    coreRegistries,
    spec,
    collab,
    options
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const {
    resolvedConfig,
    boardConfig,
    viewportLimits
  } = useMemo(
    () => resolveConfig(options),
    [options]
  )
  const {
    services,
    contextServices,
    inputDocument,
    lastOutboundDocumentRef
  } = useWhiteboardServices({
    document,
    onDocumentChange,
    coreRegistries,
    spec,
    resolvedConfig,
    boardConfig
  })
  const editor = services.editor

  useImperativeHandle(ref, () => editor, [editor])

  useWhiteboardDocumentSync({
    services,
    document,
    inputDocument,
    lastOutboundDocumentRef,
    onDocumentChange,
    viewportLimits
  })
  useWhiteboardCollab({
    collab,
    services
  })
  useWhiteboardPresence({
    binding: collab?.presence?.binding,
    containerRef,
    services
  })

  return (
    <WhiteboardServicesProvider value={contextServices}>
      <WhiteboardConfigProvider value={resolvedConfig}>
        <OverlayProvider>
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
