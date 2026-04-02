import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import type { PropertyEditIntent } from '@/react/page/interaction'

export const useDraftCommit = <TDraft,>(input: {
  onDraftChange: (draft: TDraft) => void
  onCommit: (intent?: PropertyEditIntent) => boolean
}) => {
  const commitDraft = useCallback((
    nextDraft: TDraft,
    intent: PropertyEditIntent = 'done'
  ) => {
    flushSync(() => {
      input.onDraftChange(nextDraft)
    })
    input.onCommit(intent)
  }, [input])

  const commitDraftDeferred = useCallback((
    nextDraft: TDraft,
    intent: PropertyEditIntent = 'done'
  ) => {
    flushSync(() => {
      input.onDraftChange(nextDraft)
    })

    if (typeof window === 'undefined') {
      input.onCommit(intent)
      return
    }

    window.requestAnimationFrame(() => {
      input.onCommit(intent)
    })
  }, [input])

  return {
    commitDraft,
    commitDraftDeferred
  }
}
