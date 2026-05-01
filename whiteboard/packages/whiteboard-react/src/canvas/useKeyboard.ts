import { useEffect, useMemo, type RefObject } from 'react'
import {
  createShortcutMap,
  detectShortcutPlatform,
  readShortcut,
  resolveShortcutBindings
} from '@whiteboard/react/dom/host/shortcut'
import type { ShortcutOverrides } from '@whiteboard/react/types/common/shortcut'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import { consumeDomEvent } from '@whiteboard/react/dom/host/event'
import { isKeyboardIgnoredTarget } from '@whiteboard/react/dom/host/targets'
import {
  DefaultShortcutBindings,
  runShortcut
} from '@whiteboard/react/canvas/shortcut'
import { resolveKeyboardInput } from '@whiteboard/react/dom/host/input'

export const useKeyboard = ({
  containerRef,
  shortcuts
}: {
  containerRef: RefObject<HTMLDivElement | null>
  shortcuts?: ShortcutOverrides
}) => {
  const editor = useEditorRuntime()
  const bindings = useMemo(
    () => resolveShortcutBindings(DefaultShortcutBindings, shortcuts),
    [shortcuts]
  )
  const shortcutMap = useMemo(
    () => createShortcutMap(bindings, detectShortcutPlatform()),
    [bindings]
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const focusContainer = () => {
      if (document.activeElement === container) {
        return
      }
      container.focus({ preventScroll: true })
    }

    const onPointerDown = (event: PointerEvent) => {
      if (isKeyboardIgnoredTarget(event.target)) {
        return
      }
      focusContainer()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || isKeyboardIgnoredTarget(event.target)
      ) {
        return
      }

      const input = resolveKeyboardInput(event)

      if (editor.input.keyDown(input)) {
        consumeDomEvent(event)
        return
      }

      if (event.repeat) return

      const action = readShortcut(input, shortcutMap)
      if (!action) return
      if (!runShortcut(editor, action)) return

      consumeDomEvent(event)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || isKeyboardIgnoredTarget(event.target)
      ) {
        if (
          event.code === 'Space'
          && editor.projection.runtime.editor.interaction().space
        ) {
          editor.input.keyUp(resolveKeyboardInput(event))
        }
        return
      }

      if (!editor.input.keyUp(resolveKeyboardInput(event))) {
        return
      }

      consumeDomEvent(event)
    }

    const onBlur = () => {
      editor.input.blur()
    }

    container.addEventListener('pointerdown', onPointerDown, true)
    container.addEventListener('keydown', onKeyDown)
    container.addEventListener('keyup', onKeyUp)
    if (typeof window !== 'undefined') {
      window.addEventListener('blur', onBlur)
    }

    return () => {
      container.removeEventListener('pointerdown', onPointerDown, true)
      container.removeEventListener('keydown', onKeyDown)
      container.removeEventListener('keyup', onKeyUp)
      if (typeof window !== 'undefined') {
        window.removeEventListener('blur', onBlur)
      }
    }
  }, [containerRef, editor, shortcutMap])
}
