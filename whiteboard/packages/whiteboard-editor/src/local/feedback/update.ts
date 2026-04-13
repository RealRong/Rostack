import type { EditorOverlay, EditorOverlayState } from './types'

export const updateOverlayBranch = <TKey extends keyof EditorOverlayState>(
  overlay: Pick<EditorOverlay, 'set'>,
  key: TKey,
  project: (branch: EditorOverlayState[TKey]) => EditorOverlayState[TKey]
) => {
  overlay.set((current) => {
    const nextBranch = project(current[key])
    return nextBranch === current[key]
      ? current
      : {
          ...current,
          [key]: nextBranch
        }
  })
}

export const updateOverlayNestedBranch = <
  TKey extends keyof EditorOverlayState,
  TNestedKey extends keyof EditorOverlayState[TKey]
>(
  overlay: Pick<EditorOverlay, 'set'>,
  key: TKey,
  nestedKey: TNestedKey,
  project: (
    branch: EditorOverlayState[TKey][TNestedKey]
  ) => EditorOverlayState[TKey][TNestedKey]
) => {
  overlay.set((current) => {
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
