import { useMemo, type CSSProperties, type RefObject } from 'react'
import { useStoreValue } from '@shared/react'
import {
  useEditorRuntime,
  useTool
} from '#react/runtime/hooks'
import { useBindViewportInput } from '../runtime/viewport/useBindViewportInput'
import { Background } from './Background'
import { Chrome } from './Chrome'
import { useClipboard } from './useClipboard'
import { useKeyboard } from './useKeyboard'
import { usePointer } from './usePointer'
import { DrawLayer } from '../features/draw/DrawLayer'
import { EdgeLayer } from '../features/edge/components/EdgeLayer'
import { EdgeOverlayLayer } from '../features/edge/components/EdgeOverlayLayer'
import { MindmapSceneLayer } from '../features/mindmap/components/MindmapSceneLayer'
import { NodeOverlayLayer } from '../features/node/components/NodeOverlayLayer'
import { NodeSceneLayer } from '../features/node/components/NodeSceneLayer'
import { Marquee } from '../features/selection/Marquee'
import type { ResolvedConfig } from '../types/common/config'
import type { WhiteboardPresenceBinding } from '../types/common/presence'

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
  const viewport = useStoreValue(editor.state.viewport)
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
              ? tool.kind
              : undefined
        }
        tabIndex={0}
      >
        <Background />
        <div className="wb-root-viewport" style={transformStyle}>
          <EdgeLayer />
          <NodeSceneLayer />
          <MindmapSceneLayer />
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
