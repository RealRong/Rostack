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

      const session = dataView.session.editing.inline.store.get()
      if (!session) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      if (dataView.session.editing.valueEditor.openStore.get()) {
        dataView.session.editing.valueEditor.close()
        return
      }

      dataView.session.editing.inline.exit({
        reason: 'escape'
      })
      dataView.session.selection.command.ids.replace([session.itemId], {
        anchor: session.itemId,
        focus: session.itemId
      })
    }

    const onPointerDown = (event: PointerEvent) => {
      const session = dataView.session.editing.inline.store.get()
      if (!session) {
        return
      }

      if (dataView.session.editing.valueEditor.openStore.get()) {
        return
      }

      if (closestDataviewAppearanceId(event.target) === session.itemId) {
        return
      }

      dataView.session.editing.inline.exit({
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
    dataView.session.editing.inline,
    dataView.session.selection,
    dataView.session.editing.valueEditor
  ])

  return null
}
