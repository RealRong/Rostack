import type { EdgeId, Point } from '@whiteboard/core/types'
import type { ValueStore } from '@shared/core'
import type { EditorPick } from './pick'

export type ModifierKeys = {
  alt: boolean
  shift: boolean
  ctrl: boolean
  meta: boolean
}

export type PointerSample = {
  client: Point
  screen: Point
  world: Point
}

export type PointerStateStore = Pick<ValueStore<PointerSample | null>, 'get' | 'set'>

export type PointerPhase =
  | 'down'
  | 'move'
  | 'up'

export type PointerInput<
  Phase extends PointerPhase = PointerPhase
> = {
  phase: Phase
  pointerId: number
  button: number
  buttons: number
  detail: number
  client: Point
  screen: Point
  world: Point
  samples: readonly PointerSample[]
  modifiers: ModifierKeys
  pick: EditorPick
  editable: boolean
  ignoreInput: boolean
  ignoreSelection: boolean
  ignoreContextMenu: boolean
}

export type PointerDownInput = PointerInput<'down'>
export type PointerMoveInput = PointerInput<'move'>
export type PointerUpInput = PointerInput<'up'>

export type ContextMenuInput = {
  client: Point
  screen: Point
  world: Point
  modifiers: ModifierKeys
  pick: EditorPick
  editable: boolean
  ignoreInput: boolean
  ignoreSelection: boolean
  ignoreContextMenu: boolean
}

export type ContextMenuIntent =
  | {
      kind: 'canvas'
      screen: Point
      world: Point
    }
  | {
      kind: 'selection'
      screen: Point
    }
  | {
      kind: 'edge'
      screen: Point
      edgeId: EdgeId
    }

export type WheelInput = {
  deltaX: number
  deltaY: number
  client: Point
  screen: Point
  world: Point
  modifiers: ModifierKeys
}

export type KeyboardInput = {
  key: string
  code: string
  repeat: boolean
  modifiers: ModifierKeys
}
