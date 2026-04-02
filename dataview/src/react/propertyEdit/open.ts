import type {
  PropertyEditApi,
  ValueEditorAnchor,
  ValueEditorResult
} from './types'
import type { ViewFieldRef } from './types'
import {
  ownerDocumentOf,
  resolveFieldAnchor
} from './dom'

export type PropertyEditCommitIntent = Exclude<Extract<ValueEditorResult, {
  kind: 'commit'
}>['intent'], 'done'>

export interface PropertyEditTarget {
  field: ViewFieldRef
  element?: Element | null
  seedDraft?: string
}

export const resolveOpenAnchor = (input: {
  field: ViewFieldRef
  element?: Element | null
  fallback?: (element: HTMLElement) => ValueEditorAnchor | undefined
}): ValueEditorAnchor | undefined => (
  resolveFieldAnchor(
    ownerDocumentOf(input.element),
    input.field
  ) ?? (
    input.element instanceof HTMLElement
      ? input.fallback?.(input.element)
      : undefined
  )
)

export const createPropertyEditOpener = <TTarget extends PropertyEditTarget>(options: {
  propertyEdit: PropertyEditApi
  anchor: (target: TTarget) => ValueEditorAnchor | undefined
  next?: (target: TTarget, intent: PropertyEditCommitIntent) => TTarget | null
  afterOpen?: (target: TTarget) => void
  done?: (input: {
    target: TTarget
    result: ValueEditorResult
  }) => void
}) => {
  const open = (target: TTarget): boolean => {
    const anchor = options.anchor(target)
    if (!anchor) {
      return false
    }

    const opened = options.propertyEdit.open({
      field: target.field,
      anchor,
      seedDraft: target.seedDraft,
      onResolve: result => {
        if (result.kind === 'commit' && result.intent !== 'done') {
          const nextTarget = options.next?.(target, result.intent)
          if (nextTarget && open(nextTarget)) {
            return
          }
        }

        options.done?.({
          target,
          result
        })
      }
    })
    if (!opened) {
      return false
    }

    options.afterOpen?.(target)
    return true
  }

  return open
}
