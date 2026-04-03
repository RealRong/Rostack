import type { InlineSessionExitReason } from './types'

export type InlineSessionExitEffect = 'commit' | 'discard'

export const resolveInlineSessionExitEffect = (
  reason: InlineSessionExitReason
): InlineSessionExitEffect => {
  switch (reason) {
    case 'submit':
    case 'outside':
    case 'selection':
      return 'commit'
    case 'escape':
    case 'view-change':
    case 'programmatic':
    default:
      return 'discard'
  }
}
