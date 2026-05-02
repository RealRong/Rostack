import {
  createDocumentSelectionLock,
  createPointerSession,
  readModifierKeys
} from '@shared/dom'
import type { ContextMenuIntent, EditorPick } from '@whiteboard/editor'
import type { Point } from '@whiteboard/core/types'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'
import { consumeDomEvent } from '@whiteboard/react/dom/host/event'
import {
  resolvePoint,
  resolveInteractionPointerInput,
  resolvePointerInput
} from '@whiteboard/react/dom/host/input'
import { createPickRegistry } from '@whiteboard/react/dom/host/pickRegistry'

const isViewportPanStart = (
  event: PointerEvent,
  editor: WhiteboardRuntime
) => {
  const middleDrag = event.button === 1 || (event.buttons & 4) === 4
  if (middleDrag) {
    return true
  }

  const leftDrag = event.button === 0 || (event.buttons & 1) === 1
  return leftDrag && (
    editor.scene.ui.state.interaction.get().space
    || editor.scene.ui.state.tool.is('hand')
  )
}

const scheduleScenePick = (
  editor: WhiteboardRuntime,
  input: {
    client: Point
    screen: Point
    world: Point
  }
) => {
  editor.scene.pick.schedule({
    client: input.client,
    screen: input.screen,
    world: input.world
  })
}

type PointerInputState = {
  set: (point: Point) => void
  clear: () => void
}

type PointerDownHandler = Parameters<
  WhiteboardRuntime['input']['pointerDown']
>[0]

export type PointerBridge = {
  bindPick: (element: Element, pick: EditorPick) => () => void
  contextMenu: (input: {
    container: HTMLDivElement
    event: Pick<
      MouseEvent,
      'target'
      | 'clientX'
      | 'clientY'
      | 'altKey'
      | 'shiftKey'
      | 'ctrlKey'
      | 'metaKey'
    >
  }) => ContextMenuIntent | null
  down: (input: {
    container: HTMLDivElement
    event: PointerEvent
    panEnabled: boolean
  }) => boolean
  move: (input: {
    container: HTMLDivElement
    event: PointerEvent
  }) => void
  leave: () => void
  cancel: () => void
}

export const createPointerBridge = ({
  editor,
  point,
  onPointerDown
}: {
  editor: WhiteboardRuntime
  point: PointerInputState
  onPointerDown?: (input: PointerDownHandler) => boolean
}): PointerBridge => {
  const pick = createPickRegistry()
  const pointerSession = createPointerSession()
  let releaseSession: (() => void) | null = null
  let releaseSelection: (() => void) | null = null

  const refreshContainerRect = (container: HTMLDivElement) => {
    const rect = container.getBoundingClientRect()
    editor.viewport.setRect({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    })
  }

  const clearSession = () => {
    releaseSession?.()
    releaseSession = null
    releaseSelection?.()
    releaseSelection = null
  }

  const resolveCanvasPointerInput = <Phase extends 'down' | 'move' | 'up'>(
    phase: Phase,
    container: HTMLDivElement,
    event: PointerEvent
  ) => {
    refreshContainerRect(container)
    const input = resolvePointerInput({
      phase,
      editor,
      pick,
      container,
      event
    })
    point.set(input.world)
    return input
  }

  const resolveSessionPointerInput = <Phase extends 'move' | 'up'>(
    phase: Phase,
    event: PointerEvent
  ) => {
    const input = resolveInteractionPointerInput({
      phase,
      editor,
      event
    })
    point.set(input.world)
    return input
  }

  const resolveCapturedPointerInput = <Phase extends 'move' | 'up'>(
    phase: Phase,
    container: HTMLDivElement,
    event: PointerEvent
  ) => editor.input.pointerMode(phase) === 'full'
    ? resolveCanvasPointerInput(phase, container, event)
    : resolveSessionPointerInput(phase, event)

  return {
    bindPick: (element, nextPick) => pick.bind(element, nextPick),
    contextMenu: ({ container, event }) => {
      refreshContainerRect(container)
      const resolved = resolvePoint({
        editor,
        pick,
        container,
        event
      })
      point.set(resolved.world)
      return editor.input.contextMenu({
        ...resolved,
        modifiers: readModifierKeys(event)
      })
    },
    down: ({
      container,
      event,
      panEnabled
    }) => {
      if (event.defaultPrevented) {
        return false
      }

      if (!panEnabled && isViewportPanStart(event, editor)) {
        return false
      }

      const input = resolveCanvasPointerInput('down', container, event)
      if (onPointerDown?.(input)) {
        consumeDomEvent(event)
        return true
      }

      const result = editor.input.pointerDown(input)
      if (result.handled) {
        consumeDomEvent(event)
      }
      if (result.continuePointer) {
        clearSession()
        releaseSelection = createDocumentSelectionLock(
          container.ownerDocument
        ).lock()
        releaseSession = pointerSession.start({
          container,
          pointerId: input.pointerId,
          move: (nextEvent) => {
            const moveInput = resolveCapturedPointerInput(
              'move',
              container,
              nextEvent
            )
            scheduleScenePick(editor, moveInput)
            if (editor.input.pointerMove(moveInput)) {
              consumeDomEvent(nextEvent)
            }
          },
          up: (nextEvent) => {
            const upInput = resolveCapturedPointerInput(
              'up',
              container,
              nextEvent
            )
            if (editor.input.pointerUp(upInput)) {
              consumeDomEvent(nextEvent)
            }
            clearSession()
          },
          cancel: (nextEvent) => {
            point.clear()
            if (editor.input.pointerCancel({
              pointerId: nextEvent.pointerId
            })) {
              consumeDomEvent(nextEvent)
            }
            clearSession()
          }
        })
      }

      return result.handled
    },
    move: ({
      container,
      event
    }) => {
      if (releaseSession) {
        return
      }

      const input = resolveCanvasPointerInput('move', container, event)
      scheduleScenePick(editor, input)
      editor.input.pointerMove(input)
    },
    leave: () => {
      if (releaseSession) {
        return
      }

      editor.scene.pick.clear()
      point.clear()
      editor.input.pointerLeave()
    },
    cancel: () => {
      clearSession()
      editor.scene.pick.clear()
      point.clear()
      editor.input.cancel()
    }
  }
}
