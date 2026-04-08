import { useEffect, useRef, type RefObject } from 'react'
import type { WhiteboardRuntime } from '#react/types/runtime'
import type {
  WhiteboardPresenceActivity,
  WhiteboardPresenceBinding,
  WhiteboardPresencePointer
} from '../../types/common/presence'
import {
  getSelectionSnapshot,
  resolvePresenceActivity,
  serializePresenceTool
} from '../../features/collab/presence'

const POINTER_THROTTLE_MS = 16

const readNow = () => (
  typeof performance !== 'undefined'
    ? performance.now()
    : Date.now()
)

export const PresenceLifecycle = ({
  binding,
  editor,
  containerRef
}: {
  binding?: WhiteboardPresenceBinding
  editor: WhiteboardRuntime
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const lastPointerPublishAtRef = useRef(0)

  useEffect(() => {
    if (!binding) {
      return
    }

    const syncPresence = (input?: {
      pointer?: WhiteboardPresencePointer
      clearPointer?: boolean
      activity?: WhiteboardPresenceActivity
    }) => {
      binding.updateLocalState((prev) => {
        const pointer = input?.clearPointer
          ? undefined
          : input?.pointer ?? prev?.pointer
        const activity = resolvePresenceActivity(
          editor,
          input?.activity ?? (pointer ? 'pointing' : 'idle')
        )

        return {
          user: prev?.user ?? binding.user,
          pointer,
          selection: getSelectionSnapshot(editor),
          tool: serializePresenceTool(editor.state.tool.get()),
          activity,
          updatedAt: Date.now()
        }
      })
    }

    const publishPointer = (
      clientX: number,
      clientY: number,
      activity: WhiteboardPresenceActivity
    ) => {
      const container = containerRef.current
      if (!container) {
        return
      }

      const now = readNow()
      if (now - lastPointerPublishAtRef.current < POINTER_THROTTLE_MS) {
        return
      }
      lastPointerPublishAtRef.current = now

      const pointer = editor.read.viewport.pointer({
        clientX,
        clientY
      })

      syncPresence({
        pointer: {
          world: pointer.world,
          timestamp: Date.now()
        },
        activity
      })
    }

    const clearPresence = () => {
      syncPresence({
        clearPointer: true,
        activity: 'idle'
      })
    }

    syncPresence({
      clearPointer: true,
      activity: 'idle'
    })

    const unsubscribeSelection = editor.state.selection.subscribe(() => {
      syncPresence()
    })
    const unsubscribeTool = editor.state.tool.subscribe(() => {
      syncPresence()
    })
    const unsubscribeEdit = editor.state.edit.subscribe(() => {
      syncPresence()
    })

    const container = containerRef.current
    const onPointerDown = (event: PointerEvent) => {
      publishPointer(event.clientX, event.clientY, 'pointing')
    }
    const onPointerMove = (event: PointerEvent) => {
      publishPointer(
        event.clientX,
        event.clientY,
        event.buttons === 0 ? 'pointing' : 'dragging'
      )
    }
    const onPointerUp = (event: PointerEvent) => {
      publishPointer(event.clientX, event.clientY, 'pointing')
    }
    const onPointerCancel = () => {
      clearPresence()
    }
    const onPointerLeave = () => {
      clearPresence()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        clearPresence()
      }
    }

    if (container) {
      container.addEventListener('pointerdown', onPointerDown, true)
      container.addEventListener('pointermove', onPointerMove)
      container.addEventListener('pointerup', onPointerUp)
      container.addEventListener('pointercancel', onPointerCancel)
      container.addEventListener('pointerleave', onPointerLeave)
    }

    window.addEventListener('blur', clearPresence)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      unsubscribeSelection()
      unsubscribeTool()
      unsubscribeEdit()
      if (container) {
        container.removeEventListener('pointerdown', onPointerDown, true)
        container.removeEventListener('pointermove', onPointerMove)
        container.removeEventListener('pointerup', onPointerUp)
        container.removeEventListener('pointercancel', onPointerCancel)
        container.removeEventListener('pointerleave', onPointerLeave)
      }
      window.removeEventListener('blur', clearPresence)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      binding.setLocalState(null)
    }
  }, [binding, containerRef, editor])

  return null
}
