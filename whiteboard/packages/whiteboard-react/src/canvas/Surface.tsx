import {
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type RefObject
} from 'react'
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

const viewportTransform = (viewport: ReturnType<ReturnType<typeof useEditorRuntime>['scene']['ui']['state']['viewport']['get']>): string => (
  `translate(50%, 50%) scale(${viewport.zoom}) translate(${-viewport.center.x}px, ${-viewport.center.y}px)`
)

type ChromeViewportStyle = CSSProperties & {
  '--wb-zoom': string
}

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
  const tool = useTool()
  const sceneViewportRef = useRef<HTMLDivElement | null>(null)
  const chromeViewportRef = useRef<HTMLDivElement | null>(null)
  const viewportInput = useMemo(
    () => ({
      wheelEnabled: resolvedConfig.viewport.enableWheel,
      wheelSensitivity: resolvedConfig.viewport.wheelSensitivity
    }),
    [resolvedConfig.viewport.enableWheel, resolvedConfig.viewport.wheelSensitivity]
  )
  const initialViewport = editor.scene.ui.state.viewport.get()
  const initialTransform = viewportTransform(initialViewport)
  const sceneViewportStyle = {
    transform: initialTransform,
    transformOrigin: '0 0'
  } satisfies CSSProperties
  const chromeViewportStyle = {
    transform: initialTransform,
    transformOrigin: '0 0',
    '--wb-zoom': `${initialViewport.zoom}`
  } satisfies ChromeViewportStyle

  useLayoutEffect(() => {
    const applyViewport = () => {
      const viewport = editor.scene.ui.state.viewport.get()
      const transform = viewportTransform(viewport)

      if (sceneViewportRef.current) {
        sceneViewportRef.current.style.transform = transform
      }

      if (chromeViewportRef.current) {
        chromeViewportRef.current.style.transform = transform
        chromeViewportRef.current.style.setProperty('--wb-zoom', `${viewport.zoom}`)
      }
    }

    applyViewport()

    return editor.scene.ui.state.viewport.subscribe(applyViewport)
  }, [editor])

  useClipboard({
    containerRef
  })
  // Pointer capture must run before keyboard focus capture so background clicks
  // can dismiss edit state and selection before contenteditable blur exposes stale chrome.
  usePointer({
    containerRef,
    panEnabled: resolvedConfig.viewport.enablePan
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
          tool.type === 'insert'
            ? tool.template.kind
            : tool.type === 'edge'
              ? tool.template.type
            : tool.type === 'draw'
              ? tool.mode
              : undefined
        }
        tabIndex={0}
      >
        <Background />
        <div
          ref={sceneViewportRef}
          className="wb-root-scene-viewport"
          style={sceneViewportStyle}
        >
          <CanvasScene />
          <DrawLayer />
        </div>
        <div
          ref={chromeViewportRef}
          className="wb-root-chrome-viewport"
          style={chromeViewportStyle}
        >
          <NodeOverlayLayer />
          <EdgeOverlayLayer />
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
