import {
  ownerDocumentOf,
  resolveFieldAnchor
} from '@dataview/react/dom/field'
import type {
  ValueEditorAnchor,
  ValueEditorApi,
  ValueEditorCloseAction,
  ValueEditorSessionPolicy,
  ViewFieldRef
} from '@dataview/react/runtime/valueEditor'

export const createFocusOwnerSessionPolicy = (input: {
  focusOwner: () => void
  resolveOnCommit?: ValueEditorSessionPolicy['resolveOnCommit']
  applyCloseAction?: (action: ValueEditorCloseAction) => boolean
}): ValueEditorSessionPolicy => ({
  resolveOnCommit: input.resolveOnCommit ?? (() => ({
    kind: 'focus-owner'
  })),
  applyCloseAction: action => input.applyCloseAction?.(action) ?? (
    input.focusOwner(),
    true
  ),
  onCancel: input.focusOwner,
  onDismiss: input.focusOwner
})

const resolveEditorAnchor = (input: {
  field: ViewFieldRef
  element?: Element | null
}) => resolveFieldAnchor(
  ownerDocumentOf(input.element),
  input.field
)

export const openFieldValueEditor = (input: {
  valueEditor: ValueEditorApi
  field: ViewFieldRef
  policy: ValueEditorSessionPolicy
  element?: Element | null
  seedDraft?: string
  beforeResolve?: () => void
  fallbackAnchor?: (element?: Element | null) => ValueEditorAnchor | undefined
  fallbackStrategy?: 'immediate' | 'after-retry'
  retryFrames?: number
  onFailure?: () => void
}): boolean => {
  const maxRetryFrames = input.retryFrames ?? 0

  const tryOpen = (
    attempt: number
  ): boolean => {
    input.beforeResolve?.()

    const resolvedAnchor = resolveEditorAnchor(input)
    const fallbackAllowed = (
      input.fallbackStrategy !== 'after-retry'
      || attempt >= maxRetryFrames
    )
    const anchor = resolvedAnchor ?? (
      fallbackAllowed
        ? input.fallbackAnchor?.(input.element)
        : undefined
    )
    if (anchor) {
      const opened = input.valueEditor.open({
        field: input.field,
        anchor,
        policy: input.policy,
        seedDraft: input.seedDraft
      })
      if (opened) {
        return true
      }
    }

    if (
      typeof window === 'undefined'
      || attempt >= maxRetryFrames
    ) {
      input.onFailure?.()
      return false
    }

    window.requestAnimationFrame(() => {
      tryOpen(attempt + 1)
    })
    return true
  }

  return tryOpen(0)
}
