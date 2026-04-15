import { useEffect } from 'react'
import {
  closestDataviewAppearanceId
} from '@dataview/react/dom/appearance'
import {
  useDataView
} from '@dataview/react/dataview'

export const PageInlineSessionHost = () => {
  const dataView = useDataView()

  useEffect(() => {
    if (typeof document === 'undefined') {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      const session = dataView.inlineSession.store.get()
      if (!session) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (dataView.valueEditor.openStore.get()) {
        dataView.valueEditor.close()
        return
      }

      dataView.inlineSession.exit({
        reason: 'escape'
      })
      dataView.selection.command.ids.replace([session.itemId], {
        anchor: session.itemId,
        focus: session.itemId
      })
    }

    const onPointerDown = (event: PointerEvent) => {
      const session = dataView.inlineSession.store.get()
      if (!session) {
        return
      }

      if (dataView.valueEditor.openStore.get()) {
        return
      }

      if (closestDataviewAppearanceId(event.target) === session.itemId) {
        return
      }

      dataView.inlineSession.exit({
        reason: 'outside'
      })
    }

    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [
    dataView.inlineSession,
    dataView.selection,
    dataView.valueEditor
  ])

  return null
}
