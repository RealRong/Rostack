import { useOverlayKey } from '@shared/ui/overlay'
import { keyDown } from '@dataview/react/interaction'
import { useDataView, usePageRuntime, useDataViewValue } from '@dataview/react/dataview'
import { closestTarget } from '@shared/dom'
import { pageShortcutAction } from '@dataview/react/page/keyboard'
import { useStoreValue } from '@shared/react'

const editingTargetSelector = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]'
].join(', ')

export const PageKeyboardHost = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const page = usePageRuntime()
  const pageBody = useStoreValue(page.body)
  const valueEditorOpen = useDataViewValue(
    dataView => dataView.session.page.store,
    state => state.valueEditorOpen
  )

  useOverlayKey({
    order: -100,
    onKeyDown: (event, overlay) => {
      if (
        event.defaultPrevented
        || event.isComposing
        || closestTarget(event.target, editingTargetSelector)
        || valueEditorOpen
        || overlay.topLayerId
      ) {
        return
      }

      const action = pageShortcutAction(keyDown({
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey
      }))
      if (!action) {
        return
      }

      switch (action.kind) {
        case 'undo':
          if (!engine.history.canUndo()) {
            return
          }

          engine.history.undo()
          event.preventDefault()
          return true
        case 'redo':
          if (!engine.history.canRedo()) {
            return
          }

          engine.history.redo()
          event.preventDefault()
          return true
        case 'select-all':
          if (pageBody.viewType === 'table') {
            return
          }

          dataView.session.selection.command.selectAll()
          event.preventDefault()
          return true
        case 'clear-selection':
          if (pageBody.viewType === 'table') {
            return
          }

          dataView.session.selection.command.clear()
          event.preventDefault()
          return true
        case 'remove-selection':
          if (pageBody.viewType === 'table') {
            return
          }

          if (pageBody.viewType) {
            engine.active.items.remove(
              dataView.session.selection.enumerate.materialize()
            )
          }
          event.preventDefault()
          return true
      }
    }
  })

  return null
}
