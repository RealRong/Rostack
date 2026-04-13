import { useCallback, useEffect, useState, type RefObject } from 'react'
import type { ContextMenuIntent } from '@whiteboard/editor'
import {
  useWhiteboardServices
} from '#whiteboard-react/runtime/hooks'
import { WhiteboardPopover } from '#whiteboard-react/runtime/overlay'
import { isContextMenuIgnoredTarget } from '#whiteboard-react/dom/host/targets'
import { CanvasContextMenu } from '#whiteboard-react/features/selection/chrome/panels/CanvasContextMenu'
import { EdgeContextMenu } from '#whiteboard-react/features/selection/chrome/panels/EdgeContextMenu'
import { SelectionActionMenu } from '#whiteboard-react/features/selection/chrome/panels/SelectionActionMenu'

export const ContextMenu = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const { pointer } = useWhiteboardServices()
  const [view, setView] = useState<ContextMenuIntent | null>(null)

  const dismiss = useCallback(() => {
    setView(null)
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const openFromEvent = (
      event: Pick<
        MouseEvent,
        'target'
        | 'clientX'
        | 'clientY'
        | 'altKey'
        | 'shiftKey'
        | 'ctrlKey'
        | 'metaKey'
      >
    ) => {
      const nextView = pointer.contextMenu({
        container,
        event
      })
      if (!nextView) {
        dismiss()
        return false
      }

      setView(nextView)
      return true
    }

    const onContextMenu = (event: MouseEvent) => {
      if (isContextMenuIgnoredTarget(event.target)) return

      event.preventDefault()
      event.stopPropagation()

      openFromEvent(event)
    }

    container.addEventListener('contextmenu', onContextMenu)

    return () => {
      container.removeEventListener('contextmenu', onContextMenu)
    }
  }, [containerRef, dismiss, pointer])

  if (!view) return null

  return (
    <WhiteboardPopover
      open
      anchor={view.screen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          dismiss()
        }
      }}
      placement="bottom-start"
      offset={0}
      animated={false}
      mode="blocking"
      backdrop="transparent"
      padding='menu'
      size='md'
    >
      {view.kind === 'selection' ? (
        <SelectionActionMenu onClose={dismiss} />
      ) : view.kind === 'canvas' ? (
        <CanvasContextMenu
          world={view.world}
          onClose={dismiss}
        />
      ) : (
        <EdgeContextMenu
          edgeId={view.edgeId}
          onClose={dismiss}
        />
      )}
    </WhiteboardPopover>
  )
}
