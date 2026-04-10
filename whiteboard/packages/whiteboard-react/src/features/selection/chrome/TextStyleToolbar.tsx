import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from 'react'
import { Button, cn } from '@ui'
import type { Point } from '@whiteboard/core/types'
import { useElementSize, useStoreValue } from '@shared/react'
import { useEditorRuntime } from '#react/runtime/hooks'
import { WhiteboardPopover } from '#react/runtime/overlay'
import {
  buildToolbarStyle,
  resolveToolbarPlacement
} from './layout'
import { FillPanel } from './panels/FillPanel'
import { FontSizePanel } from './panels/FontSizePanel'
import { TextColorPanel } from './panels/TextColorPanel'
import {
  ToolbarDivider,
  ToolbarFillIcon,
  ToolbarIconButton,
  ToolbarTextColorIcon
} from './toolbar/primitives'
import { Bold, Italic } from 'lucide-react'

type PanelKey = 'font-size' | 'text-color' | 'background'

type ToolbarPositionSession = {
  key: string
  placement: 'top' | 'bottom'
  anchorWorld: Point
}

const resolveToolbarAnchorWorld = ({
  placement,
  x,
  y,
  width,
  height
}: {
  placement: 'top' | 'bottom'
  x: number
  y: number
  width: number
  height: number
}): Point => ({
  x: x + width / 2,
  y: placement === 'top'
    ? y
    : y + height
})

export const TextStyleToolbar = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const editor = useEditorRuntime()
  const surface = useElementSize(containerRef)
  const box = useStoreValue(editor.select.selection.box())
  const panel = useStoreValue(editor.select.panel())
  const context = panel.textToolbar
  const buttonRefByKey = useRef<Partial<Record<PanelKey, HTMLElement | null>>>({})
  const [activePanelKey, setActivePanelKey] = useState<PanelKey | null>(null)
  const [positionSession, setPositionSession] = useState<ToolbarPositionSession | null>(null)
  const key = context
    ? (
        context.session.kind === 'node'
          ? `node:${context.session.nodeId}:${context.session.field}`
          : `edge-label:${context.session.edgeId}:${context.session.labelId}`
      )
    : null
  const worldToScreen = useCallback(
    (point: Point) => editor.select.viewport.worldToScreen(point),
    [editor]
  )

  const closePanel = useCallback(() => {
    setActivePanelKey(null)
  }, [])

  const togglePanel = useCallback((next: PanelKey) => {
    setActivePanelKey((current) => current === next ? null : next)
  }, [])

  const livePlacement = box
    ? resolveToolbarPlacement({
        worldToScreen,
        rect: box
      })
    : undefined
  const livePosition = key && box && livePlacement
    ? {
        key,
        placement: livePlacement.placement,
        anchorWorld: resolveToolbarAnchorWorld({
          placement: livePlacement.placement,
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height
        })
      } satisfies ToolbarPositionSession
    : null

  useEffect(() => {
    closePanel()
  }, [closePanel, key])

  useEffect(() => {
    if (!context || !livePosition || !key) {
      setPositionSession(null)
      return
    }

    setPositionSession((current) => {
      if (current?.key === key) {
        return current
      }

      return livePosition
    })
  }, [context, key, livePosition])

  if (!context || !box) {
    return null
  }

  const resolvedPosition = positionSession?.key === key
    ? positionSession
    : livePosition
  const toolbarAnchor = resolvedPosition
    ? worldToScreen(resolvedPosition.anchorWorld)
    : livePlacement?.anchor
  if (!toolbarAnchor) {
    return null
  }

  const items = [
    context.tools.includes('size') ? 'font-size' : null,
    'divider',
    context.tools.includes('weight') ? 'bold' : null,
    context.tools.includes('italic') ? 'italic' : null,
    'text-color',
    context.tools.includes('background') ? 'background' : null
  ].filter(Boolean)
  const itemUnits = items.reduce((total, item) => total + (item === 'font-size' ? 2 : item === 'divider' ? 1 : 1), 0)
  const toolbarStyle = buildToolbarStyle({
    placement: resolvedPosition?.placement ?? livePlacement?.placement ?? 'top',
    x: toolbarAnchor.x,
    y: (resolvedPosition?.placement ?? livePlacement?.placement ?? 'top') === 'top'
      ? toolbarAnchor.y - 12
      : toolbarAnchor.y + 12,
    containerWidth: surface.width,
    itemCount: Math.max(itemUnits, 1)
  })

  const activePanelButton = activePanelKey
    ? buttonRefByKey.current[activePanelKey]
    : null
  const activeWeight = (context.values.weight ?? 400) >= 600

  return (
    <div className="pointer-events-none absolute inset-0 z-[var(--wb-z-toolbar)]">
      <div
        className="pointer-events-auto absolute inline-flex items-center gap-1 rounded-2xl bg-floating px-2 py-1.5 shadow-popover"
        style={toolbarStyle}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        {items.map((item, index) => {
          if (item === 'divider') {
            return <ToolbarDivider key={`divider:${index}`} />
          }

          if (item === 'font-size') {
            return (
              <Button
                key={item}
                ref={(element) => {
                  buttonRefByKey.current['font-size'] = element
                }}
                variant="ghost"
                className={cn('min-w-12 justify-center px-2', activePanelKey === 'font-size' && 'bg-pressed')}
                onClick={() => {
                  togglePanel('font-size')
                }}
              >
                {context.values.size ?? 14}
              </Button>
            )
          }

          if (item === 'bold') {
            return (
              <ToolbarIconButton
                key={item}
                active={activeWeight}
                title="Bold"
                onClick={() => {
                  editor.actions.edit.style({
                    weight: activeWeight ? 400 : 700
                  })
                }}
              >
                <Bold className="h-4 w-4" />
              </ToolbarIconButton>
            )
          }

          if (item === 'italic') {
            return (
              <ToolbarIconButton
                key={item}
                active={context.values.italic}
                title="Italic"
                onClick={() => {
                  editor.actions.edit.style({
                    italic: !context.values.italic
                  })
                }}
              >
                <Italic className="h-4 w-4" />
              </ToolbarIconButton>
            )
          }

          if (item === 'text-color') {
            return (
              <Button
                key={item}
                ref={(element) => {
                  buttonRefByKey.current['text-color'] = element
                }}
                variant="ghost"
                size="icon"
                className={cn(
                  'h-9 w-9 rounded-xl text-fg',
                  activePanelKey === 'text-color' && 'bg-pressed text-fg'
                )}
                title="Text color"
                aria-label="Text color"
                onClick={() => {
                  togglePanel('text-color')
                }}
              >
                <ToolbarTextColorIcon color={context.values.color} />
              </Button>
            )
          }

          return (
            <Button
              key={item}
              ref={(element) => {
                buttonRefByKey.current.background = element
              }}
              variant="ghost"
              size="icon"
              className={cn(
                'h-9 w-9 rounded-xl text-fg',
                activePanelKey === 'background' && 'bg-pressed text-fg'
              )}
              title="Background"
              aria-label="Background"
              onClick={() => {
                togglePanel('background')
              }}
            >
              <ToolbarFillIcon fill={context.values.background} />
            </Button>
          )
        })}
      </div>
      {activePanelKey && activePanelButton ? (
        <WhiteboardPopover
          open
          anchor={activePanelButton}
          placement="bottom-start"
          offset={8}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              closePanel()
            }
          }}
        >
          {activePanelKey === 'font-size' ? (
            <FontSizePanel
              value={context.values.size}
              onChange={(value) => {
                editor.actions.edit.style({
                  size: value
                })
              }}
            />
          ) : activePanelKey === 'text-color' ? (
            <TextColorPanel
              value={context.values.color}
              onChange={(value) => {
                editor.actions.edit.style({
                  color: value
                })
              }}
            />
          ) : (
            <FillPanel
              fill={context.values.background}
              onFillChange={(value) => {
                editor.actions.edit.style({
                  background: value
                })
              }}
            />
          )}
        </WhiteboardPopover>
      ) : null}
    </div>
  )
}
