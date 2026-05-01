import {
  useEffect,
  useRef,
  type RefObject
} from 'react'
import { scheduler } from '@shared/core'
import {
  getSelectionSnapshot,
  resolvePresenceActivity,
  serializePresenceTool
} from '@whiteboard/react/features/collab/presence'
import type {
  WhiteboardPresenceActivity,
  WhiteboardPresenceBinding,
  WhiteboardPresencePointer
} from '@whiteboard/react/types/common/presence'
import type { WhiteboardRuntimeServices } from '@whiteboard/react/runtime/whiteboard/services'

const POINTER_THROTTLE_MS = 16

export const useWhiteboardPresence = (input: {
  binding?: WhiteboardPresenceBinding
  containerRef: RefObject<HTMLDivElement | null>
  services: WhiteboardRuntimeServices
}) => {
  const lastPointerPublishAtRef = useRef(0)

  useEffect(() => {
    const binding = input.binding
    if (!binding) {
      return
    }

    const syncPresence = (next?: {
      pointer?: WhiteboardPresencePointer
      clearPointer?: boolean
      activity?: WhiteboardPresenceActivity
    }) => {
      binding.updateLocalState((prev) => {
        const pointer = next?.clearPointer
          ? undefined
          : next?.pointer ?? prev?.pointer
        const activity = resolvePresenceActivity(
          input.services.editor,
          next?.activity ?? (pointer ? 'pointing' : 'idle')
        )

        return {
          user: prev?.user ?? binding.user,
          pointer,
          selection: getSelectionSnapshot(input.services.editor),
          tool: serializePresenceTool(input.services.editor.scene.editor.tool.get()),
          activity,
          updatedAt: Date.now()
        }
      })
    }

    const publishPointer = (
      clientX: number,
      clientY: number,
      activity: 'pointing' | 'dragging'
    ) => {
      const container = input.containerRef.current
      if (!container) {
        return
      }

      const now = scheduler.readMonotonicNow()
      if (now - lastPointerPublishAtRef.current < POINTER_THROTTLE_MS) {
        return
      }
      lastPointerPublishAtRef.current = now

      const pointer = input.services.editor.scene.editor.viewport.pointer({
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

    const unsubscribeSelection = input.services.editor.scene.editor.selection.subscribe(() => {
      syncPresence()
    })
    const unsubscribeTool = input.services.editor.scene.editor.tool.subscribe(() => {
      syncPresence()
    })
    const unsubscribeEdit = input.services.editor.scene.editor.edit.subscribe(() => {
      syncPresence()
    })

    const container = input.containerRef.current
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
      if (globalThis.document.visibilityState !== 'visible') {
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
    globalThis.document.addEventListener('visibilitychange', onVisibilityChange)

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
      globalThis.document.removeEventListener('visibilitychange', onVisibilityChange)
      binding.setLocalState(null)
    }
  }, [input.binding, input.containerRef, input.services])
}
