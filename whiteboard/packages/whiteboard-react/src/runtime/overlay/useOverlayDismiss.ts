import { useEffect, type RefObject } from 'react'

export type OverlayDismissReason =
  | 'outside-press'
  | 'escape-key'

export const useOverlayDismiss = ({
  enabled,
  rootRef,
  onDismiss
}: {
  enabled: boolean
  rootRef: RefObject<HTMLElement | null>
  onDismiss: (reason: OverlayDismissReason) => void
}) => {
  useEffect(() => {
    if (!enabled) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (!root) {
        return
      }
      if (event.target instanceof Node && root.contains(event.target)) {
        return
      }
      onDismiss('outside-press')
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      onDismiss('escape-key')
    }

    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [enabled, onDismiss, rootRef])
}
