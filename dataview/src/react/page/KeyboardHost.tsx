import { useEffect } from 'react'
import { keyDown } from '@dataview/react/interaction'
import { useCurrentView, useEngine, usePageValue } from '@dataview/react/editor'
import { closestTarget } from '@dataview/dom/interactive'
import { pageShortcutAction } from './keyboard'

const editingTargetSelector = [
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]'
].join(', ')

export const PageKeyboardHost = () => {
  const engine = useEngine()
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
          if (uiLock || currentView?.view.type === 'table') {
            return
          }

          currentView?.commands.selection.all()
          event.preventDefault()
          return
        case 'clear-selection':
          if (uiLock || currentView?.view.type === 'table') {
            return
          }

          currentView?.commands.selection.clear()
          event.preventDefault()
          return
        case 'remove-selection':
          if (uiLock || currentView?.view.type === 'table') {
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
  }, [currentView, engine, uiLock])

  return null
}
