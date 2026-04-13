import type { EditorFeedbackRuntime, EditorFeedbackState } from '#whiteboard-editor/local/feedback/types'

export const updateFeedbackBranch = <TKey extends keyof EditorFeedbackState>(
  feedback: Pick<EditorFeedbackRuntime, 'set'>,
  key: TKey,
  project: (branch: EditorFeedbackState[TKey]) => EditorFeedbackState[TKey]
) => {
  feedback.set((current) => {
    const nextBranch = project(current[key])
    return nextBranch === current[key]
      ? current
      : {
          ...current,
          [key]: nextBranch
        }
  })
}

export const updateFeedbackNestedBranch = <
  TKey extends keyof EditorFeedbackState,
  TNestedKey extends keyof EditorFeedbackState[TKey]
>(
  feedback: Pick<EditorFeedbackRuntime, 'set'>,
  key: TKey,
  nestedKey: TNestedKey,
  project: (
    branch: EditorFeedbackState[TKey][TNestedKey]
  ) => EditorFeedbackState[TKey][TNestedKey]
) => {
  feedback.set((current) => {
    const branch = current[key]
    const nextNestedBranch = project(branch[nestedKey])
    return nextNestedBranch === branch[nestedKey]
      ? current
      : {
          ...current,
          [key]: {
            ...branch,
            [nestedKey]: nextNestedBranch
          }
        }
  })
}
