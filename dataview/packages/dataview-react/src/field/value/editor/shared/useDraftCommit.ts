import { useCallback } from 'react'
import { flushSync } from 'react-dom'
import type { EditorSubmitTrigger } from '#dataview-react/interaction'

export const useDraftCommit = <TDraft,>(input: {
  onDraftChange: (draft: TDraft) => void
  onApply: () => boolean
  onCommit: (trigger: EditorSubmitTrigger) => boolean
}) => {
  const applyDraft = useCallback((
    nextDraft: TDraft
  ) => {
    flushSync(() => {
      input.onDraftChange(nextDraft)
    })
    input.onApply()
  }, [input])

  const commitDraft = useCallback((
    nextDraft: TDraft,
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    flushSync(() => {
      input.onDraftChange(nextDraft)
    })
    input.onCommit(trigger)
  }, [input])

  const commitDraftDeferred = useCallback((
    nextDraft: TDraft,
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    flushSync(() => {
      input.onDraftChange(nextDraft)
    })

    if (typeof window === 'undefined') {
      input.onCommit(trigger)
      return
    }

    window.requestAnimationFrame(() => {
      input.onCommit(trigger)
    })
  }, [input])

  return {
    applyDraft,
    commitDraft,
    commitDraftDeferred
  }
}
