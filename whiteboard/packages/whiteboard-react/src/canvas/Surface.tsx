import { useMemo, type CSSProperties, type RefObject } from 'react'
import {
  useEditorRuntime,
  useTool
} from '../runtime/hooks/useEditor'
import { useStoreValue } from '../runtime/hooks/useStoreValue'
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
import {
  ContainerChromeLayer,
  FrameLayer
} from '../features/node/components/FrameLayer'
import { NodeOverlayLayer } from '../features/node/components/NodeOverlayLayer'
import { NodeSceneLayer } from '../features/node/components/NodeSceneLayer'
import type { ResolvedConfig } from '../types/common/config'

export const Surface = ({
  resolvedConfig,
  containerRef,
  containerStyle
}: {
  resolvedConfig: ResolvedConfig
  containerRef: RefObject<HTMLDivElement | null>
  containerStyle?: CSSProperties
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
      ref={containerRef}
      className={resolvedConfig.className ? `wb-root-container ${resolvedConfig.className}` : 'wb-root-container'}
      data-tool={tool.type}
      data-tool-value={
        tool.type === 'edge' || tool.type === 'insert'
          ? tool.preset
          : tool.type === 'draw'
            ? tool.kind
            : undefined
      }
      style={containerStyle}
      tabIndex={0}
    >
      <Background />
      <div className="wb-root-viewport" style={transformStyle}>
        <FrameLayer />
        <EdgeLayer />
        <NodeSceneLayer />
        <MindmapSceneLayer />
        <ContainerChromeLayer />
        <NodeOverlayLayer />
        <EdgeOverlayLayer />
        <DrawLayer />
      </div>
      <Chrome containerRef={containerRef} />
    </div>
  )
}
