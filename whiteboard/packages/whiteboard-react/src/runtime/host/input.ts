import type {
  KeyboardInput,
  EditorPick,
  PointerInput,
  PointerPhase,
  PointerSample,
  WheelInput
} from '@whiteboard/editor'
import type { Point } from '@whiteboard/core/types'
import type { WhiteboardRuntime } from '../../types/runtime'
import type { PickRegistry } from './pickRegistry'
import {
  isContextMenuIgnoredTarget,
  isEditableTarget,
  isInputIgnoredTarget,
  isSelectionIgnoredTarget,
  readEditableFieldTarget
} from './domTargets'

type TargetEvent = Pick<MouseEvent | PointerEvent | WheelEvent, 'target' | 'clientX' | 'clientY'>
type ClientPointInput = Pick<MouseEvent | PointerEvent | WheelEvent, 'clientX' | 'clientY'>

const BackgroundPick: EditorPick = {
  kind: 'background'
}

export type HostResolvedPoint = {
  pick: EditorPick
  client: Point
  screen: Point
  world: Point
  field?: ReturnType<typeof readEditableFieldTarget>
  editable: boolean
  ignoreInput: boolean
  ignoreSelection: boolean
  ignoreContextMenu: boolean
}

const resolveElement = (
  target: EventTarget | null,
  container: Element
) => (
  target instanceof Element && container.contains(target)
    ? target
    : null
)

const resolveElementAtPoint = (
  container: Element,
  input: ClientPointInput
) => {
  const document = container.ownerDocument
  if (!document?.elementFromPoint) {
    return null
  }

  return resolveElement(
    document.elementFromPoint(input.clientX, input.clientY),
    container
  )
}

const readPointerSnapshot = (
  editor: WhiteboardRuntime,
  input: ClientPointInput
) => {
  const point = editor.read.viewport.pointer(input)

  return {
    client: {
      x: input.clientX,
      y: input.clientY
    },
    screen: point.screen,
    world: point.world
  }
}

const toPointerSample = (
  editor: WhiteboardRuntime,
  input: ClientPointInput
): PointerSample => readPointerSnapshot(editor, input)

export const resolveHostPoint = ({
  editor,
  pick,
  container,
  event
}: {
  editor: WhiteboardRuntime
  pick: PickRegistry
  container: Element
  event: TargetEvent
}): HostResolvedPoint => {
  const element = resolveElementAtPoint(container, event)
    ?? resolveElement(event.target, container)
  const point = readPointerSnapshot(editor, event)

  return {
    pick: pick.element(element, container) ?? BackgroundPick,
    client: point.client,
    screen: point.screen,
    world: point.world,
    field: readEditableFieldTarget(element),
    editable: isEditableTarget(element),
    ignoreInput: isInputIgnoredTarget(element),
    ignoreSelection: isSelectionIgnoredTarget(element),
    ignoreContextMenu: isContextMenuIgnoredTarget(element)
  }
}

export const resolvePointerInput = <Phase extends PointerPhase>({
  phase,
  editor,
  pick,
  container,
  event
}: {
  phase: Phase
  editor: WhiteboardRuntime
  pick: PickRegistry
  container: Element
  event: PointerEvent
}): PointerInput<Phase> => {
  const resolved = resolveHostPoint({
    editor,
    pick,
    container,
    event
  })

  const coalesced = typeof event.getCoalescedEvents === 'function'
    ? event.getCoalescedEvents()
    : []

  return {
    phase,
    pointerId: event.pointerId,
    button: event.button,
    buttons: event.buttons,
    detail: event.detail,
    client: resolved.client,
    screen: resolved.screen,
    world: resolved.world,
    modifiers: {
      alt: event.altKey,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey
    },
    pick: resolved.pick,
    field: resolved.field,
    editable: resolved.editable,
    ignoreInput: resolved.ignoreInput,
    ignoreSelection: resolved.ignoreSelection,
    ignoreContextMenu: resolved.ignoreContextMenu,
    samples: coalesced.length > 0
      ? coalesced.map((entry) => toPointerSample(editor, entry))
      : [{
          client: resolved.client,
          screen: resolved.screen,
          world: resolved.world
        }]
  }
}

export const resolveWheelInput = ({
  editor,
  event
}: {
  editor: WhiteboardRuntime
  event: WheelEvent
}): WheelInput => {
  const point = readPointerSnapshot(editor, event)

  return {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
    client: point.client,
    screen: point.screen,
    world: point.world,
    modifiers: {
      alt: event.altKey,
      shift: event.shiftKey,
      ctrl: event.ctrlKey,
      meta: event.metaKey
    }
  }
}

export const resolveKeyboardInput = (
  event: KeyboardEvent
): KeyboardInput => ({
  key: event.key,
  code: event.code,
  repeat: event.repeat,
  modifiers: {
    alt: event.altKey,
    shift: event.shiftKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey
  }
})
