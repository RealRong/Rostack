import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from 'react'
import type { Point, Rect } from '@whiteboard/core/types'
import { cn, FloatingLayer, ToolbarBar } from '@shared/ui'
import { useElementSize } from '@shared/react'
import { WhiteboardPopover } from '@whiteboard/react/runtime/overlay'
import {
  buildToolbarStyle,
  resolveToolbarAnchorWorld,
  resolveToolbarPlacement
} from '@whiteboard/react/features/selection/chrome/layout'

type FloatingToolbarPositionSession = {
  key: string
  placement: 'top' | 'bottom'
  anchorWorld: Point
}

export type FloatingToolbarRenderArgs<TPanelKey extends string> = {
  activePanelKey: TPanelKey | null
  closePanel: () => void
  togglePanel: (key: TPanelKey) => void
  registerPanelButton: (key: TPanelKey, element: HTMLElement | null) => void
}

export const FloatingToolbarShell = <TPanelKey extends string>({
  containerRef,
  toolbarKey,
  box,
  itemCount,
  worldToScreen,
  panelClassName,
  renderToolbar,
  renderPanel
}: {
  containerRef: RefObject<HTMLDivElement | null>
  toolbarKey: string | null
  box?: Rect
  itemCount: number
  worldToScreen: (point: Point) => Point
  panelClassName?: string | ((key: TPanelKey) => string | undefined)
  renderToolbar: (args: FloatingToolbarRenderArgs<TPanelKey>) => ReactNode
  renderPanel: (args: {
    activePanelKey: TPanelKey
    closePanel: () => void
  }) => ReactNode
}) => {
  const surface = useElementSize(containerRef)
  const buttonRefByKey = useRef<Partial<Record<TPanelKey, HTMLElement | null>>>({})
  const [activePanelKey, setActivePanelKey] = useState<TPanelKey | null>(null)
  const [positionSession, setPositionSession] =
    useState<FloatingToolbarPositionSession | null>(null)

  const closePanel = useCallback(() => {
    setActivePanelKey(null)
  }, [])

  const togglePanel = useCallback((key: TPanelKey) => {
    setActivePanelKey((current) => current === key ? null : key)
  }, [])

  const livePlacement = box
    ? resolveToolbarPlacement({
        worldToScreen,
        rect: box
      })
    : undefined
  const livePosition = toolbarKey && box && livePlacement
    ? {
        key: toolbarKey,
        placement: livePlacement.placement,
        anchorWorld: resolveToolbarAnchorWorld({
          placement: livePlacement.placement,
          rect: box
        })
      } satisfies FloatingToolbarPositionSession
    : null

  useEffect(() => {
    closePanel()
  }, [closePanel, toolbarKey])

  useEffect(() => {
    if (!toolbarKey || !livePosition) {
      setPositionSession(null)
      return
    }

    setPositionSession((current) => current?.key === toolbarKey ? current : livePosition)
  }, [livePosition, toolbarKey])

  if (!toolbarKey || !box || !livePlacement) {
    return null
  }

  const resolvedPosition = positionSession?.key === toolbarKey
    ? positionSession
    : livePosition
  const toolbarAnchor = resolvedPosition
    ? worldToScreen(resolvedPosition.anchorWorld)
    : livePlacement.anchor
  if (!toolbarAnchor) {
    return null
  }

  const placement = resolvedPosition?.placement ?? livePlacement.placement
  const toolbarStyle = buildToolbarStyle({
    placement,
    x: toolbarAnchor.x,
    y: placement === 'top'
      ? toolbarAnchor.y - 12
      : toolbarAnchor.y + 12,
    containerWidth: surface.width,
    itemCount: Math.max(itemCount, 1)
  })
  const activePanelButton = activePanelKey
    ? buttonRefByKey.current[activePanelKey]
    : null
  const panelContent = activePanelKey
    ? renderPanel({
        activePanelKey,
        closePanel
      })
    : null
  const resolvedPanelClassName = activePanelKey
    ? typeof panelClassName === 'function'
      ? panelClassName(activePanelKey)
      : panelClassName
    : panelClassName

  return (
    <FloatingLayer className="z-[var(--wb-z-toolbar)]">
      <ToolbarBar
        className="absolute"
        style={toolbarStyle}
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        {renderToolbar({
          activePanelKey,
          closePanel,
          togglePanel,
          registerPanelButton: (key, element) => {
            buttonRefByKey.current[key] = element
          }
        })}
      </ToolbarBar>
      {activePanelKey && activePanelButton && panelContent ? (
        <WhiteboardPopover
          open
          anchor={activePanelButton}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              closePanel()
            }
          }}
          placement="bottom"
          offset={10}
          surface="blocking"
          backdrop="transparent"
          padding="menu"
          size="unset"
          contentClassName={cn('min-w-0 overflow-hidden p-0', resolvedPanelClassName)}
        >
          {panelContent}
        </WhiteboardPopover>
      ) : null}
    </FloatingLayer>
  )
}
