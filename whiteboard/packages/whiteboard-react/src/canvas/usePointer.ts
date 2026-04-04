import {
  useCallback,
  useEffect,
  useRef,
  type RefObject
} from 'react'
import { useEditor } from '../runtime/hooks/useEditor'
import { useHostRuntime } from '../runtime/hooks/useHost'
import { consumeDomEvent } from '../runtime/host/event'
import { resolvePointerInput } from '../runtime/host/input'

export const usePointer = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const editor = useEditor()
  const host = useHostRuntime()
  const releaseSessionRef = useRef<(() => void) | null>(null)
  const releaseSelectionRef = useRef<(() => void) | null>(null)

  const refreshContainerRect = useCallback((container: HTMLDivElement) => {
    const rect = container.getBoundingClientRect()
    editor.commands.viewport.setRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    })
  }, [editor])

  const clearSession = useCallback(() => {
    releaseSessionRef.current?.()
    releaseSessionRef.current = null
    releaseSelectionRef.current?.()
    releaseSelectionRef.current = null
  }, [])

  const resolveCanvasPointerInput = useCallback(<Phase extends 'down' | 'move' | 'up'>(
    phase: Phase,
    container: HTMLDivElement,
    event: PointerEvent
  ) => {
    refreshContainerRect(container)
    const input = resolvePointerInput({
      phase,
      editor,
      pick: host.pick,
      container,
      event
    })
    host.pointer.set(input.world)
    return input
  }, [editor, host, refreshContainerRect])

  useEffect(() => () => {
    clearSession()
    editor.input.cancel()
  }, [clearSession, editor])

  const onPointerDown = useCallback((event: PointerEvent) => {
    if (event.defaultPrevented) {
      return false
    }

    const container = containerRef.current
    if (!container) {
      return false
    }

    const input = resolveCanvasPointerInput('down', container, event)
    if (host.insert.pointerDown(editor, input)) {
      consumeDomEvent(event)
      return true
    }
    const result = editor.input.pointerDown(input)
    if (result.handled) {
      consumeDomEvent(event)
    }
    if (result.continuePointer) {
      clearSession()
      releaseSelectionRef.current = host.selectionLock.lock()
      releaseSessionRef.current = host.pointerSession.start({
        container,
        pointerId: input.pointerId,
        move: (nextEvent) => {
          const moveInput = resolveCanvasPointerInput('move', container, nextEvent)
          if (editor.input.pointerMove(moveInput)) {
            consumeDomEvent(nextEvent)
          }
        },
        up: (nextEvent) => {
          const upInput = resolveCanvasPointerInput('up', container, nextEvent)
          if (editor.input.pointerUp(upInput)) {
            consumeDomEvent(nextEvent)
          }
          clearSession()
        },
        cancel: (nextEvent) => {
          host.pointer.clear()
          if (editor.input.pointerCancel({
            pointerId: nextEvent.pointerId
          })) {
            consumeDomEvent(nextEvent)
          }
          clearSession()
        }
      })
    }

    return result.handled
  }, [clearSession, containerRef, editor, host, refreshContainerRect])

  const onPointerMove = useCallback((event: PointerEvent) => {
    if (releaseSessionRef.current) {
      return
    }

    const container = containerRef.current
    if (!container) {
      return
    }

    const input = resolveCanvasPointerInput('move', container, event)
    editor.input.pointerMove(input)
  }, [containerRef, editor, resolveCanvasPointerInput])

  const onPointerLeave = useCallback(() => {
    if (releaseSessionRef.current) {
      return
    }

    host.pointer.clear()
    editor.input.pointerLeave()
  }, [editor, host])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      onPointerDown(event)
    }
    const handlePointerMove = (event: PointerEvent) => {
      onPointerMove(event)
    }
    const handlePointerLeave = () => {
      onPointerLeave()
    }

    container.addEventListener('pointerdown', handlePointerDown, true)
    container.addEventListener('pointermove', handlePointerMove)
    container.addEventListener('pointerleave', handlePointerLeave)
    return () => {
      container.removeEventListener('pointerdown', handlePointerDown, true)
      container.removeEventListener('pointermove', handlePointerMove)
      container.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [containerRef, onPointerDown, onPointerLeave, onPointerMove])
}
