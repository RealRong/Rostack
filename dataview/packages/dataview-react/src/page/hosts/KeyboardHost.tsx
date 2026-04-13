import { useOverlayKey } from '@shared/ui/overlay'
import { keyDown } from '#react/interaction/index.ts'
import { useDataView, useDataViewValue } from '#react/dataview/index.ts'
import { closestTarget } from '@shared/dom'
import { pageShortcutAction } from '#react/page/keyboard.ts'

const editingTargetSelector = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]'
].join(', ')

export const PageKeyboardHost = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const currentView = useDataViewValue(dataView => dataView.engine.active.config)
  const valueEditorOpen = useDataViewValue(
    dataView => dataView.page.store,
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
          if (currentView?.type === 'table') {
            return
          }

          dataView.selection.all()
          event.preventDefault()
          return true
        case 'clear-selection':
          if (currentView?.type === 'table') {
            return
          }

          dataView.selection.clear()
          event.preventDefault()
          return true
        case 'remove-selection':
          if (currentView?.type === 'table') {
            return
          }

          if (currentView) {
            engine.active.items.remove(
              dataView.selection.get().ids
            )
          }
          event.preventDefault()
          return true
      }
    }
  })

  return null
}
