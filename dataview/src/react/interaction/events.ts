import type { PropertyId, RecordId } from '@dataview/core/contracts'

export interface Modifiers {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
}

export type ValueEditorIntent =
  | 'done'
  | 'next-field'
  | 'previous-field'
  | 'next-item'

export interface Point {
  x: number
  y: number
}

export type Hit =
  | {
      type: 'cell'
      recordId: RecordId
      propertyId: PropertyId
    }
  | {
      type: 'fill-handle'
    }
  | {
      type: 'row-select'
      recordId: RecordId
    }
  | {
      type: 'blank-grid'
    }
  | {
      type: 'column-header'
      propertyId: PropertyId
    }

export type InteractionEvent =
  | {
      type: 'pointer.down'
      hit: Hit
      point: Point
      modifiers: Modifiers
    }
  | {
      type: 'pointer.move'
      hit?: Hit
      point: Point
      modifiers: Modifiers
    }
  | {
      type: 'pointer.up'
      hit?: Hit
      point: Point
      modifiers: Modifiers
    }
  | {
      type: 'pointer.cancel'
    }
  | {
      type: 'key.down'
      key: string
      modifiers: Modifiers
    }
  | {
      type: 'edit.commit'
      value: unknown | undefined
      intent: ValueEditorIntent
    }
  | {
      type: 'edit.cancel'
    }
  | {
      type: 'focus.changed'
      target?: {
        type: 'cell'
        recordId: RecordId
        propertyId: PropertyId
      } | {
        type: 'row'
        recordId: RecordId
      }
    }

export type PointerInput = Extract<InteractionEvent, {
  type: 'pointer.down' | 'pointer.move' | 'pointer.up' | 'pointer.cancel'
}>

export type KeyInput = Extract<InteractionEvent, {
  type: 'key.down'
}>

export type EditInput = Extract<InteractionEvent, {
  type: 'edit.commit' | 'edit.cancel'
}>

export const modifiers = (input: {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
}): Modifiers => ({
  shiftKey: input.shiftKey,
  metaKey: input.metaKey,
  ctrlKey: input.ctrlKey,
  altKey: input.altKey
})

export const keyDown = (input: {
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
}): KeyInput => ({
  type: 'key.down',
  key: input.key,
  modifiers: modifiers(input)
})

export const commit = (
  value: unknown | undefined,
  intent: ValueEditorIntent = 'done'
): EditInput => ({
  type: 'edit.commit',
  value,
  intent
})

export const cancel = (): EditInput => ({
  type: 'edit.cancel'
})
