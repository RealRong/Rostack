import { useOverlayKey } from '@shared/ui/overlay'
import { keyDown } from '@dataview/react/interaction'
import { useDataView, usePageModel } from '@dataview/react/dataview'
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
  const page = usePageModel()
  const pageBody = useStoreValue(page.body)
  const valueEditorOpen = pageBody.valueEditorOpen

  const applyHistory = (
    kind: 'undo' | 'redo'
  ): boolean => {
    const history = engine.history
    if (!history) {
      return false
    }

    const operations = kind === 'undo'
      ? history.undo()
      : history.redo()
    if (!operations) {
      return false
    }

    const result = engine.apply(operations, {
      origin: 'history'
    })
    if (result.ok) {
      history.confirm()
      return true
    }

    history.cancel('restore')
    return false
  }

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
          if (!engine.history?.state().canUndo) {
            return
          }

          if (applyHistory('undo')) {
            event.preventDefault()
            return true
          }
          return
        case 'redo':
          if (!engine.history?.state().canRedo) {
            return
          }

          if (applyHistory('redo')) {
            event.preventDefault()
            return true
          }
          return
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
