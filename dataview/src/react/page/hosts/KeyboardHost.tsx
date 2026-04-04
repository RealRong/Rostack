import { useEffect } from 'react'
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

const keyboardPrioritySurfaceSelector = [
  '[role="menu"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]'
].join(', ')

export const PageKeyboardHost = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const currentView = useCurrentView()
  const uiLock = usePageValue(state => state.lock)

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.isComposing
        || closestTarget(event.target, editingTargetSelector)
        || uiLock
        || closestTarget(event.target, keyboardPrioritySurfaceSelector)
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
          return
        case 'redo':
          if (!engine.history.canRedo()) {
            return
          }

          engine.history.redo()
          event.preventDefault()
          return
        case 'select-all':
          if (currentView?.view.type === 'table') {
            return
          }

          dataView.selection.all()
          event.preventDefault()
          return
        case 'clear-selection':
          if (currentView?.view.type === 'table') {
            return
          }

          dataView.selection.clear()
          event.preventDefault()
          return
        case 'remove-selection':
          if (currentView?.view.type === 'table') {
            return
          }

          currentView?.commands.mutation.remove()
          event.preventDefault()
          return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [currentView, dataView.selection, engine, uiLock])

  return null
}
