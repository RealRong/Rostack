import { useEffect, useRef, type RefObject } from 'react'
import { useWhiteboardServices } from '@whiteboard/react/runtime/hooks'

export const usePointer = ({
  containerRef,
  panEnabled
}: {
  containerRef: RefObject<HTMLDivElement | null>
  panEnabled: boolean
}) => {
  const { pointer } = useWhiteboardServices()
  const panEnabledRef = useRef(panEnabled)

  panEnabledRef.current = panEnabled

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 2) {
        return
      }

      pointer.down({
        container,
        event,
        panEnabled: panEnabledRef.current
      })
    }

    const onPointerMove = (event: PointerEvent) => {
      pointer.move({
        container,
        event
      })
    }

    const onPointerLeave = () => {
      pointer.leave()
    }

    container.addEventListener('pointerdown', onPointerDown, true)
    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerleave', onPointerLeave)

    return () => {
      container.removeEventListener('pointerdown', onPointerDown, true)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerleave', onPointerLeave)
      pointer.cancel()
    }
  }, [containerRef, pointer])
}
