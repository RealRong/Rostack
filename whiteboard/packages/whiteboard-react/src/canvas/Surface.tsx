import { useMemo, type CSSProperties, type RefObject } from 'react'
import { useStoreValue } from '@shared/react'
import {
  useEditorRuntime,
  useTool
} from '@whiteboard/react/runtime/hooks'
import { useBindViewportInput } from '@whiteboard/react/runtime/viewport/useBindViewportInput'
import { Background } from '@whiteboard/react/canvas/Background'
import { Chrome } from '@whiteboard/react/canvas/Chrome'
import { useClipboard } from '@whiteboard/react/canvas/useClipboard'
import { useKeyboard } from '@whiteboard/react/canvas/useKeyboard'
import { usePointer } from '@whiteboard/react/canvas/usePointer'
import { CanvasScene } from '@whiteboard/react/canvas/CanvasScene'
import { DrawLayer } from '@whiteboard/react/features/draw/DrawLayer'
import { EdgeOverlayLayer } from '@whiteboard/react/features/edge/components/EdgeOverlayLayer'
import { NodeOverlayLayer } from '@whiteboard/react/features/node/components/NodeOverlayLayer'
import { Marquee } from '@whiteboard/react/features/selection/Marquee'
import type { ResolvedConfig } from '@whiteboard/react/types/common/config'
import type { WhiteboardPresenceBinding } from '@whiteboard/react/types/common/presence'

export const Surface = ({
  resolvedConfig,
  containerRef,
  containerStyle,
  presenceBinding
}: {
  resolvedConfig: ResolvedConfig
  containerRef: RefObject<HTMLDivElement | null>
  containerStyle?: CSSProperties
  presenceBinding?: WhiteboardPresenceBinding
}) => {
  const editor = useEditorRuntime()
  const viewport = useStoreValue(editor.store.viewport)
  const tool = useTool()
  const viewportInput = useMemo(
    () => ({
      wheelEnabled: resolvedConfig.viewport.enableWheel,
      wheelSensitivity: resolvedConfig.viewport.wheelSensitivity
    }),
    [resolvedConfig.viewport.enableWheel, resolvedConfig.viewport.wheelSensitivity]
  )
  const transformStyle = useMemo(
    () => ({
      transform: `translate(50%, 50%) scale(${viewport.zoom}) translate(${-viewport.center.x}px, ${-viewport.center.y}px)`,
      transformOrigin: '0 0',
      '--wb-zoom': `${viewport.zoom}`
    } as CSSProperties),
    [viewport]
  )

  useClipboard({
    containerRef
  })
  useKeyboard({
    containerRef,
    shortcuts: resolvedConfig.shortcuts
  })
  useBindViewportInput({
    editor,
    containerRef,
    options: viewportInput
  })
  usePointer({
    containerRef,
    panEnabled: resolvedConfig.viewport.enablePan
  })

  return (
    <div
      className={resolvedConfig.className ? `wb-container ${resolvedConfig.className}` : 'wb-container'}
      style={containerStyle}
    >
      <div
        ref={containerRef}
        className="wb-root-container"
        data-tool={tool.type}
        data-tool-value={
          tool.type === 'edge' || tool.type === 'insert'
            ? tool.preset
            : tool.type === 'draw'
              ? tool.mode
              : undefined
        }
        tabIndex={0}
      >
        <Background />
        <div className="wb-root-viewport" style={transformStyle}>
          <CanvasScene />
          <NodeOverlayLayer />
          <EdgeOverlayLayer />
          <DrawLayer />
        </div>
        <Marquee />
      </div>
      <div className="wb-overlay">
        <Chrome
          containerRef={containerRef}
          presenceBinding={presenceBinding}
        />
      </div>
    </div>
  )
}
