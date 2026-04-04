import type { KeyboardInput } from '@whiteboard/editor'
import type {
  ShortcutAction,
  ShortcutBinding,
  ShortcutOverrides
} from '../../types/common/shortcut'

const ModifierOrder = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const

export type ShortcutPlatform = 'mac' | 'win' | 'linux'

type ShortcutKeyInput = Pick<KeyboardInput, 'key' | 'modifiers'>

const normalizeKey = (value: string) => {
  if (value === ' ') return 'Space'
  if (value.length === 1) return value.toUpperCase()
  return value
}

const normalizeBindingChord = (
  raw: string,
  platform: ShortcutPlatform
): string | undefined => {
  const tokens = raw
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)

  if (!tokens.length) return undefined

  let keyToken: string | undefined
  const modifiers = new Set<string>()

  tokens.forEach((token) => {
    const lowered = token.toLowerCase()
    if (lowered === 'mod') {
      modifiers.add(platform === 'mac' ? 'Meta' : 'Ctrl')
      return
    }
    if (lowered === 'ctrl' || lowered === 'control') {
      modifiers.add('Ctrl')
      return
    }
    if (lowered === 'meta' || lowered === 'cmd' || lowered === 'command') {
      modifiers.add('Meta')
      return
    }
    if (lowered === 'alt' || lowered === 'option') {
      modifiers.add('Alt')
      return
    }
    if (lowered === 'shift') {
      modifiers.add('Shift')
      return
    }
    keyToken = normalizeKey(token)
  })

  if (!keyToken) return undefined

  return [
    ...ModifierOrder.filter((modifier) => modifiers.has(modifier)),
    keyToken
  ].join('+')
}

export const detectShortcutPlatform = (): ShortcutPlatform => {
  if (typeof navigator === 'undefined') {
    return 'win'
  }

  const value = navigator.platform.toLowerCase()
  if (value.includes('mac')) return 'mac'
  if (value.includes('win')) return 'win'
  return 'linux'
}

export const readShortcut = (
  event: ShortcutKeyInput,
  shortcuts: ReadonlyMap<string, ShortcutAction>
): ShortcutAction | undefined => {
  const normalized = normalizeKey(event.key)
  if (
    normalized === 'Control'
    || normalized === 'Shift'
    || normalized === 'Alt'
    || normalized === 'Meta'
  ) {
    return undefined
  }

  const parts: string[] = []
  if (event.modifiers.ctrl) parts.push('Ctrl')
  if (event.modifiers.alt) parts.push('Alt')
  if (event.modifiers.shift) parts.push('Shift')
  if (event.modifiers.meta) parts.push('Meta')
  parts.push(normalized)

  return shortcuts.get(parts.join('+'))
}

export const createShortcutMap = (
  bindings: readonly ShortcutBinding[],
  platform: ShortcutPlatform
): ReadonlyMap<string, ShortcutAction> => {
  const map = new Map<string, ShortcutAction>()

  bindings.forEach((binding) => {
    const chord = normalizeBindingChord(binding.key, platform)
    if (!chord) {
      return
    }

    map.set(chord, binding.action)
  })

  return map
}

export const resolveShortcutBindings = (
  defaults: readonly ShortcutBinding[],
  overrides?: ShortcutOverrides
): readonly ShortcutBinding[] => {
  if (!overrides) {
    return defaults
  }

  return typeof overrides === 'function'
    ? overrides(defaults)
    : overrides
}
