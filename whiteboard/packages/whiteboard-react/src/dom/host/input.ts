import {
  elementFromPointWithin,
  elementsFromPointWithin,
  readClientPoint,
  readCoalescedPointerEvents,
  readModifierKeys,
  resolveContainedElement
} from '@shared/dom'
import type {
  KeyboardInput,
  EditorPick,
  PointerInput,
  PointerSample,
  WheelInput
} from '@whiteboard/editor'
import type { Point } from '@whiteboard/core/types'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'
import type { PickRegistry } from '@whiteboard/react/dom/host/pickRegistry'
import {
  isContextMenuIgnoredTarget,
  isEditableTarget,
  isInputIgnoredTarget,
  isSelectionIgnoredTarget
} from '@whiteboard/react/dom/host/targets'

type TargetEvent = Pick<MouseEvent | PointerEvent | WheelEvent, 'target' | 'clientX' | 'clientY'>
type ClientPointInput = Pick<MouseEvent | PointerEvent | WheelEvent, 'clientX' | 'clientY'>

const BackgroundPick: EditorPick = {
  kind: 'background'
}

export type ResolvedPoint = {
  pick: EditorPick
  client: Point
  screen: Point
  world: Point
  editable: boolean
  ignoreInput: boolean
  ignoreSelection: boolean
  ignoreContextMenu: boolean
}

const resolveElement = (
  target: EventTarget | null,
  container: Element
) => resolveContainedElement(target, container)

const resolveElementAtPoint = (
  container: Element,
  input: ClientPointInput
) => elementFromPointWithin(container, input)

const resolveElementsAtPoint = (
  container: Element,
  input: ClientPointInput
) => elementsFromPointWithin(container, input)

const readPointerSnapshot = (
  editor: WhiteboardRuntime,
  input: ClientPointInput
) => {
  const point = editor.session.viewport.pointer(input)

  return {
    client: readClientPoint(input),
    screen: point.screen,
    world: point.world
  }
}

const toPointerSample = (
  editor: WhiteboardRuntime,
  input: ClientPointInput
): PointerSample => readPointerSnapshot(editor, input)

const isSelectedItemPick = (
  editor: WhiteboardRuntime,
  pick: EditorPick
) => {
  const selection = editor.session.selection.get()

  if (pick.kind === 'node') {
    return selection.nodeIds.includes(pick.id)
  }

  if (pick.kind === 'edge') {
    return selection.edgeIds.includes(pick.id)
  }

  return false
}

const resolveSelectionBoxUnderlyingPick = (
  editor: WhiteboardRuntime,
  pick: PickRegistry,
  container: Element,
  elements: readonly Element[]
) => {
  for (const element of elements) {
    const nextPick = pick.element(element, container)
    if (!nextPick || nextPick.kind === 'selection-box') {
      continue
    }

    if (isSelectedItemPick(editor, nextPick)) {
      return nextPick
    }
  }

  return undefined
}

export const resolvePoint = ({
  editor,
  pick,
  container,
  event
}: {
  editor: WhiteboardRuntime
  pick: PickRegistry
  container: Element
  event: TargetEvent
}): ResolvedPoint => {
  const element = resolveElementAtPoint(container, event)
    ?? resolveElement(event.target, container)
  const point = readPointerSnapshot(editor, event)
  const primaryPick = pick.element(element, container) ?? BackgroundPick
  const resolvedPick =
    primaryPick.kind === 'selection-box'
    && primaryPick.part === 'body'
      ? resolveSelectionBoxUnderlyingPick(
          editor,
          pick,
          container,
          resolveElementsAtPoint(container, event).slice(1)
        ) ?? primaryPick
      : primaryPick

  return {
    pick: resolvedPick,
    client: point.client,
    screen: point.screen,
    world: point.world,
    editable: isEditableTarget(element),
    ignoreInput: isInputIgnoredTarget(element),
    ignoreSelection: isSelectionIgnoredTarget(element),
    ignoreContextMenu: isContextMenuIgnoredTarget(element)
  }
}

export const resolvePointerInput = <Phase extends PointerInput['phase']>({
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
  const resolved = resolvePoint({
    editor,
    pick,
    container,
    event
  })

  const coalesced = readCoalescedPointerEvents(event)

  return {
    phase,
    pointerId: event.pointerId,
    button: event.button,
    buttons: event.buttons,
    detail: event.detail,
    client: resolved.client,
    screen: resolved.screen,
    world: resolved.world,
    modifiers: readModifierKeys(event),
    pick: resolved.pick,
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

export const resolveInteractionPointerInput = <Phase extends 'move' | 'up'>({
  phase,
  editor,
  event
}: {
  phase: Phase
  editor: WhiteboardRuntime
  event: PointerEvent
}): PointerInput<Phase> => {
  // Captured interaction sessions consume coordinates/modifiers/samples only.
  const point = readPointerSnapshot(editor, event)
  const coalesced = readCoalescedPointerEvents(event)

  return {
    phase,
    pointerId: event.pointerId,
    button: event.button,
    buttons: event.buttons,
    detail: event.detail,
    client: point.client,
    screen: point.screen,
    world: point.world,
    modifiers: readModifierKeys(event),
    pick: BackgroundPick,
    editable: false,
    ignoreInput: false,
    ignoreSelection: false,
    ignoreContextMenu: false,
    samples: coalesced.length > 0
      ? coalesced.map((entry) => toPointerSample(editor, entry))
      : [{
          client: point.client,
          screen: point.screen,
          world: point.world
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
    modifiers: readModifierKeys(event)
  }
}

export const resolveKeyboardInput = (
  event: KeyboardEvent
): KeyboardInput => ({
  key: event.key,
  code: event.code,
  repeat: event.repeat,
  modifiers: readModifierKeys(event)
})
