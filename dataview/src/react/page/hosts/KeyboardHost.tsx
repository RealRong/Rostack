import { useOverlayKey } from '@ui/overlay'
import { keyDown } from '@dataview/react/interaction'
import { useCurrentView, useDataView, usePageValue } from '@dataview/react/dataview'
import { closestTarget } from '@dataview/dom/interactive'
import { pageShortcutAction } from '@dataview/react/page/keyboard'

const editingTargetSelector = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]'
].join(', ')

export const PageKeyboardHost = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const currentView = useCurrentView()
  const valueEditorOpen = usePageValue(state => state.valueEditorOpen)

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
          if (currentView?.view.type === 'table') {
            return
          }

          dataView.selection.all()
          event.preventDefault()
          return true
        case 'clear-selection':
          if (currentView?.view.type === 'table') {
            return
          }

          dataView.selection.clear()
          event.preventDefault()
          return true
        case 'remove-selection':
          if (currentView?.view.type === 'table') {
            return
          }

          currentView?.commands.mutation.remove()
          event.preventDefault()
          return true
      }
    }
  })

  return null
}
