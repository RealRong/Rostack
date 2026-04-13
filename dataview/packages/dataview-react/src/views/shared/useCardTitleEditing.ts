import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import type {
  TitleFieldId,
  DataRecord,
  ViewId
} from '@dataview/core/contracts'
import {
  useDataView,
  useDataViewValue
} from '#react/dataview/index.ts'
import type { ItemId } from '@dataview/engine'
import {
  resolveInlineSessionExitEffect
} from '#react/runtime/inlineSession/index.ts'
import {
  readCardTitleText
} from '#react/views/shared/cardTitleValue.ts'

export const useCardEditingState = (input: {
  viewId: ViewId
  itemId: ItemId
}) => useDataViewValue(
  dataView => dataView.inlineSession.store,
  target => (
    target?.viewId === input.viewId
      && target.itemId === input.itemId
  )
)

export const useCardTitleEditing = (input: {
  viewId: ViewId
  itemId: ItemId
  record: DataRecord
}) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const editing = useCardEditingState({
    viewId: input.viewId,
    itemId: input.itemId
  })
  const committedTitle = readCardTitleText(input.record)
  const [titleDraft, setTitleDraft] = useState(() => committedTitle)
  const titleDraftRef = useRef(titleDraft)
  const committedTitleRef = useRef(committedTitle)
  const exitEffectRef = useRef<ReturnType<typeof resolveInlineSessionExitEffect> | null>(null)

  useEffect(() => {
    titleDraftRef.current = titleDraft
  }, [titleDraft])

  useEffect(() => {
    committedTitleRef.current = committedTitle
  }, [committedTitle])

  useEffect(() => {
    if (editing) {
      exitEffectRef.current = null
    }

    if (editing) {
      return
    }

    setTitleDraft(committedTitle)
  }, [committedTitle, editing])

  const enterEdit = useCallback(() => {
    setTitleDraft(readCardTitleText(input.record))
    dataView.selection.clear()
    dataView.inlineSession.enter({
      viewId: input.viewId,
      itemId: input.itemId
    })
  }, [
    dataView.inlineSession,
    dataView.selection,
    input.itemId,
    input.record,
    input.viewId
  ])

  const commitTitle = useCallback(() => {
    if (exitEffectRef.current === 'discard') {
      return
    }

    const nextValue = titleDraftRef.current.trim()
    if (nextValue === committedTitleRef.current) {
      return
    }

    committedTitleRef.current = nextValue
    engine.records.values.set(input.record.id, 'title' as TitleFieldId, nextValue)
  }, [
    engine,
    input.record.id
  ])

  const resetTitleDraft = useCallback(() => {
    setTitleDraft(committedTitleRef.current)
  }, [])

  const submitTitle = useCallback(() => {
    commitTitle()
    dataView.inlineSession.exit({
      reason: 'submit'
    })
  }, [commitTitle, dataView.inlineSession])

  useEffect(() => {
    if (!editing) {
      return
    }

    return dataView.inlineSession.onExit(event => {
      if (
        event.target.viewId !== input.viewId
        || event.target.itemId !== input.itemId
      ) {
        return
      }

      const exitEffect = resolveInlineSessionExitEffect(event.reason)
      exitEffectRef.current = exitEffect
      if (exitEffect === 'discard') {
        resetTitleDraft()
        return
      }

      commitTitle()
    })
  }, [
    commitTitle,
    dataView.inlineSession,
    editing,
    input.itemId,
    input.viewId,
    resetTitleDraft
  ])

  return {
    editing,
    mode: editing ? 'edit' as const : 'view' as const,
    committedTitle,
    titleDraft,
    setTitleDraft,
    enterEdit,
    commitTitle,
    submitTitle
  }
}
