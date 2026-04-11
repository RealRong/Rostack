import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import type { Point } from '@whiteboard/core/types'
import { useElementSize, useStoreValue } from '@shared/react'
import { useEditorRuntime } from '#react/runtime/hooks'
import { WhiteboardPopover } from '#react/runtime/overlay'
import {
  buildToolbarStyle,
  resolveToolbarPlacement
} from './layout'
import { readToolbarItemSpec, renderToolbarPanel } from './toolbar/items'
import { ToolbarDivider } from './toolbar/primitives'
import { resolveToolbarRecipe } from './toolbar/recipe'
import type { ToolbarPanelKey } from './toolbar/types'
import { cn } from '@ui'

type ToolbarPositionSession = {
  selectionKey: string
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

export const NodeToolbar = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const editor = useEditorRuntime()
  const surface = useElementSize(containerRef)
  const panel = useStoreValue(editor.select.panel())
  const toolbar = panel.nodeToolbar
  const buttonRefByKey = useRef<Partial<Record<ToolbarPanelKey, HTMLElement | null>>>({})
  const [activePanelKey, setActivePanelKey] = useState<ToolbarPanelKey | null>(null)
  const [positionSession, setPositionSession] = useState<ToolbarPositionSession | null>(null)
  const worldToScreen = useCallback(
    (point: Point) => editor.select.viewport.worldToScreen(point),
    [editor]
  )
  const recipe = useMemo(
    () => toolbar ? resolveToolbarRecipe(toolbar) : [],
    [toolbar]
  )

  const closePanel = useCallback(() => {
    setActivePanelKey(null)
  }, [])

  const togglePanel = useCallback((key: ToolbarPanelKey) => {
    setActivePanelKey((current) => current === key ? null : key)
  }, [])

  const selectionKey = toolbar?.key ?? null
  const selectionBox = toolbar?.box
  const livePlacement = selectionBox
    ? resolveToolbarPlacement({
        worldToScreen,
        rect: selectionBox
      })
    : undefined
  const livePosition = toolbar && selectionBox && selectionKey && livePlacement
    ? {
        selectionKey,
        placement: livePlacement.placement,
        anchorWorld: resolveToolbarAnchorWorld({
          placement: livePlacement.placement,
          x: selectionBox.x,
          y: selectionBox.y,
          width: selectionBox.width,
          height: selectionBox.height
        })
      } satisfies ToolbarPositionSession
    : null

  useEffect(() => {
    closePanel()
  }, [
    closePanel,
    selectionKey
  ])

  useEffect(() => {
    if (!toolbar) {
      closePanel()
    }
  }, [closePanel, toolbar])

  useEffect(() => {
    if (!toolbar || !livePosition || !selectionKey || recipe.length === 0) {
      setPositionSession(null)
      return
    }

    setPositionSession((current) => {
      if (current?.selectionKey === selectionKey) {
        return current
      }

      return livePosition
    })
  }, [
    toolbar,
    livePosition,
    recipe.length,
    selectionKey
  ])

  if (!toolbar || !recipe.length) {
    return null
  }

  const resolvedPosition = positionSession?.selectionKey === selectionKey
    ? positionSession
    : livePosition
  const toolbarAnchor = resolvedPosition
    ? worldToScreen(resolvedPosition.anchorWorld)
    : livePlacement?.anchor
  const toolbarUnits = recipe.reduce((total, entry) => (
    total + (
      entry.kind === 'divider'
        ? 1
        : (readToolbarItemSpec(entry.key).units ?? 1)
    )
  ), 0)

  if (!toolbarAnchor) {
    return null
  }

  const toolbarStyle = buildToolbarStyle({
    placement: resolvedPosition?.placement ?? livePlacement?.placement ?? 'top',
    x: toolbarAnchor.x,
    y: (resolvedPosition?.placement ?? livePlacement?.placement ?? 'top') === 'top'
      ? toolbarAnchor.y - 12
      : toolbarAnchor.y + 12,
    containerWidth: surface.width,
    itemCount: Math.max(toolbarUnits, 1)
  })

  const activePanelButton = activePanelKey
    ? buttonRefByKey.current[activePanelKey]
    : null
  const panelContent = renderToolbarPanel({
    panelKey: activePanelKey,
    context: toolbar,
    editor,
    closePanel
  })

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
        {recipe.map((entry, index) => {
          if (entry.kind === 'divider') {
            return <ToolbarDivider key={`divider:${index}`} />
          }

          const spec = readToolbarItemSpec(entry.key)

          return (
            <Fragment key={`${entry.key}:${index}`}>
              {spec.renderButton({
                context: toolbar,
                editor,
                activePanelKey,
                togglePanel,
                registerPanelButton: (key, element) => {
                  buttonRefByKey.current[key] = element
                }
              })}
            </Fragment>
          )
        })}
      </div>
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
          size="md"
          contentClassName={cn(
            'min-w-0 overflow-hidden p-0',
            activePanelKey === 'more' || activePanelKey === 'filter'
              ? 'w-[240px]'
              : 'w-auto'
          )}
        >
          {panelContent}
        </WhiteboardPopover>
      ) : null}
    </div>
  )
}
