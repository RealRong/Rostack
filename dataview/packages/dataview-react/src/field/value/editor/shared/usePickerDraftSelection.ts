import { useCallback, useMemo } from 'react'
import type { EditorSubmitTrigger } from '#react/interaction'

const splitDraftKeys = <Key extends string>(draft: string) => draft
  .split(',')
  .map(item => item.trim())
  .filter(Boolean) as Key[]

const joinDraftKeys = <Key extends string>(keys: readonly Key[]) => keys.join(', ')

export type PickerSelectionUpdateMode = 'apply' | 'commit'
export type PickerSelectionMode = 'single' | 'multi'

export const usePickerDraftSelection = <Key extends string>(input: {
  mode: PickerSelectionMode
  draft: string
  onDraftChange: (draft: string) => void
  applyDraft: (draft: string) => void
  commitDraft: (
    draft: string,
    trigger?: EditorSubmitTrigger
  ) => void
  commitDraftDeferred: (
    draft: string,
    trigger?: EditorSubmitTrigger
  ) => void
  deserializeDraft?: (draft: string) => readonly Key[]
  serializeKeys?: (keys: readonly Key[]) => string
}) => {
  const deserializeDraft = input.deserializeDraft ?? splitDraftKeys<Key>
  const serializeKeys = input.serializeKeys ?? joinDraftKeys<Key>
  const selectedKeys = useMemo(
    () => deserializeDraft(input.draft),
    [deserializeDraft, input.draft]
  )
  const selectedKeySet = useMemo(
    () => new Set(selectedKeys),
    [selectedKeys]
  )

  const replaceKeys = useCallback((
    nextKeys: readonly Key[],
    mode: PickerSelectionUpdateMode = input.mode === 'single'
      ? 'commit'
      : 'apply',
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    if (input.mode === 'single') {
      const nextDraft = nextKeys[0] ?? ''
      if (mode === 'commit') {
        input.commitDraftDeferred(nextDraft, trigger)
        return
      }

      input.onDraftChange(nextDraft)
      return
    }

    const nextDraft = serializeKeys(nextKeys)
    if (mode === 'apply') {
      input.applyDraft(nextDraft)
      return
    }

    input.commitDraft(nextDraft, trigger)
  }, [input, serializeKeys])

  const selectKey = useCallback((
    key: Key,
    mode: PickerSelectionUpdateMode = input.mode === 'single'
      ? 'commit'
      : 'apply',
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    if (input.mode === 'single') {
      replaceKeys([key], mode, trigger)
      return
    }

    if (selectedKeySet.has(key)) {
      return
    }

    replaceKeys([...selectedKeys, key], mode, trigger)
  }, [input.mode, replaceKeys, selectedKeys, selectedKeySet])

  const removeKey = useCallback((key: Key) => {
    if (input.mode === 'single') {
      if (input.draft === key) {
        input.onDraftChange('')
      }
      return
    }

    if (!selectedKeySet.has(key)) {
      return
    }

    input.onDraftChange(serializeKeys(
      selectedKeys.filter(selectedKey => selectedKey !== key)
    ))
  }, [
    input.draft,
    input.mode,
    input.onDraftChange,
    selectedKeySet,
    selectedKeys,
    serializeKeys
  ])

  const clearSelection = useCallback(() => {
    input.onDraftChange('')
  }, [input])

  return {
    selectedKeys,
    selectedKeySet,
    replaceKeys,
    selectKey,
    removeKey,
    clearSelection
  }
}
