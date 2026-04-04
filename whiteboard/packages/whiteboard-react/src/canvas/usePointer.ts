import { useEffect, type RefObject } from 'react'
import { useWhiteboard } from '../runtime/hooks/useWhiteboard'

export const usePointer = ({
  containerRef,
  panEnabled
}: {
  containerRef: RefObject<HTMLDivElement | null>
  panEnabled: boolean
}) => {
  const whiteboard = useWhiteboard()

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      whiteboard.pointer.down({
        container,
        event,
        panEnabled
      })
    }

    const onPointerMove = (event: PointerEvent) => {
      whiteboard.pointer.move({
        container,
        event
      })
    }

    const onPointerLeave = () => {
      whiteboard.pointer.leave()
    }

    container.addEventListener('pointerdown', onPointerDown, true)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerleave', onPointerLeave)

    return () => {
      container.removeEventListener('pointerdown', onPointerDown, true)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerleave', onPointerLeave)
      whiteboard.pointer.cancel()
    }
  }, [containerRef, panEnabled, whiteboard])
}
