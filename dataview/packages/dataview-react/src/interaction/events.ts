import type { Point as SharedPoint } from '@shared/dom'
import {
  readDomModifierKeys,
  type DomModifierKeys
} from '@shared/dom'
import type { CustomFieldId, RecordId } from '@dataview/core/types'

export type Modifiers = DomModifierKeys

export type EditorSubmitTrigger =
  | 'enter'
  | 'tab-next'
  | 'tab-previous'
  | 'outside'
  | 'programmatic'

export type Point = SharedPoint

export type Hit =
  | {
      type: 'cell'
      recordId: RecordId
      fieldId: CustomFieldId
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
      fieldId: CustomFieldId
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
      type: 'edit.apply'
      value: unknown | undefined
    }
  | {
      type: 'edit.commit'
      value: unknown | undefined
      trigger: EditorSubmitTrigger
    }
  | {
      type: 'edit.cancel'
    }
  | {
      type: 'focus.changed'
      target?: {
        type: 'cell'
        recordId: RecordId
        fieldId: CustomFieldId
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
  type: 'edit.apply' | 'edit.commit' | 'edit.cancel'
}>

export const modifiers = (input: {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
}): Modifiers => readDomModifierKeys(input)

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

export const apply = (
  value: unknown | undefined
): EditInput => ({
  type: 'edit.apply',
  value
})

export const commit = (
  value: unknown | undefined,
  trigger: EditorSubmitTrigger = 'programmatic'
): EditInput => ({
  type: 'edit.commit',
  value,
  trigger
})

export const cancel = (): EditInput => ({
  type: 'edit.cancel'
})
