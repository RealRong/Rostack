import type { KeyInput } from '@dataview/react/page/interaction'

export type PageShortcutAction =
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'select-all' }
  | { kind: 'clear-selection' }
  | { kind: 'remove-selection' }

const isPrimaryModifier = (input: KeyInput) => (
  input.modifiers.metaKey || input.modifiers.ctrlKey
)

export const pageShortcutAction = (
  input: KeyInput
): PageShortcutAction | null => {
  const key = input.key.toLowerCase()
  if (
    !input.modifiers.metaKey
    && !input.modifiers.ctrlKey
    && !input.modifiers.altKey
    && !input.modifiers.shiftKey
  ) {
    switch (key) {
      case 'escape':
        return { kind: 'clear-selection' }
      case 'backspace':
      case 'delete':
        return { kind: 'remove-selection' }
      default:
        return null
    }
  }

  if (!isPrimaryModifier(input) || input.modifiers.altKey) {
    return null
  }

  if (key === 'z') {
    return {
      kind: input.modifiers.shiftKey ? 'redo' : 'undo'
    }
  }

  if (
    key === 'y'
    && input.modifiers.ctrlKey
    && !input.modifiers.metaKey
    && !input.modifiers.shiftKey
  ) {
    return { kind: 'redo' }
  }

  if (key === 'a' && !input.modifiers.shiftKey) {
    return { kind: 'select-all' }
  }

  return null
}
