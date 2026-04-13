import type { EditorSubmitTrigger } from '#react/interaction'

export type KeyAction =
  | {
    type: 'commit'
    trigger: EditorSubmitTrigger
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
}): KeyAction => {
  if (input.composing) {
    return {
      type: 'none'
    }
  }

  switch (input.key) {
    case 'Enter':
      return {
        type: 'commit',
        trigger: 'enter'
      }
    case 'Tab':
      return {
        type: 'commit',
        trigger: input.shiftKey ? 'tab-previous' : 'tab-next'
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
