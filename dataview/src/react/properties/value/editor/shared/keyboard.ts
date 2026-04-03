import type { ValueEditorIntent } from '@dataview/react/interaction'

export type KeyAction =
  | {
    type: 'submit'
    intent: ValueEditorIntent
  }
  | {
    type: 'cancel'
  }
  | {
    type: 'none'
  }

export const isComposing = (input: {
  isComposing?: boolean
  keyCode?: number
  nativeEvent?: {
    isComposing?: boolean
  }
}) => (
  Boolean(input.isComposing || input.nativeEvent?.isComposing || input.keyCode === 229)
)

export const keyAction = (input: {
  key: string
  shiftKey: boolean
  composing: boolean
  enterIntent?: ValueEditorIntent
}): KeyAction => {
  if (input.composing) {
    return {
      type: 'none'
    }
  }

  switch (input.key) {
    case 'Enter':
      return {
        type: 'submit',
        intent: input.enterIntent ?? 'done'
      }
    case 'Tab':
      return {
        type: 'submit',
        intent: input.shiftKey ? 'previous-field' : 'next-field'
      }
    case 'Escape':
      return {
        type: 'cancel'
      }
    default:
      return {
        type: 'none'
      }
  }
}
