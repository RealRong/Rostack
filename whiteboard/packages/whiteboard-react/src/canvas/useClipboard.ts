import { useEffect, type RefObject } from 'react'
import {
  isEditableTarget,
  isInputIgnoredTarget
} from '../dom/host/targets'
import { consumeDomEvent } from '../dom/host/event'
import { useWhiteboardServices } from '../runtime/hooks/useWhiteboard'

export const useClipboard = ({
  containerRef
}: {
  containerRef: RefObject<HTMLDivElement | null>
}) => {
  const { clipboard } = useWhiteboardServices()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const shouldIgnore = (target: EventTarget | null) =>
      isEditableTarget(target) || isInputIgnoredTarget(target)

    const bindClipboardEvent = (
      action: (event: ClipboardEvent) => Promise<boolean>
    ) => (event: ClipboardEvent) => {
      if (event.defaultPrevented || shouldIgnore(event.target)) {
        return
      }

      consumeDomEvent(event)
      void action(event)
    }

    const onCopy = bindClipboardEvent((event) => (
      clipboard.copy('selection', {
        event
      })
    ))

    const onCut = bindClipboardEvent((event) => (
      clipboard.cut('selection', {
        event
      })
    ))

    const onPaste = bindClipboardEvent((event) => (
      clipboard.paste({
        event
      })
    ))

    container.addEventListener('copy', onCopy)
    container.addEventListener('cut', onCut)
    container.addEventListener('paste', onPaste)

    return () => {
      container.removeEventListener('copy', onCopy)
      container.removeEventListener('cut', onCut)
      container.removeEventListener('paste', onPaste)
    }
  }, [clipboard, containerRef])
}
