import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import type {
  GroupProperty,
  GroupRecord,
  ViewId
} from '@dataview/core/contracts'
import {
  useDataView,
  useInlineSessionValue
} from '@dataview/react/dataview'
import type { AppearanceId } from '@dataview/react/runtime/currentView'
import {
  resolveInlineSessionExitEffect
} from '@dataview/react/runtime/inlineSession'
import {
  readCardTitleText
} from './cardTitleValue'

export const useCardEditingState = (input: {
  viewId: ViewId
  appearanceId: AppearanceId
}) => useInlineSessionValue(target => (
  target?.viewId === input.viewId
    && target.appearanceId === input.appearanceId
))

export const useCardTitleEditing = (input: {
  viewId: ViewId
  appearanceId: AppearanceId
  record: GroupRecord
  titleProperty?: GroupProperty
}) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const editing = useCardEditingState({
    viewId: input.viewId,
    appearanceId: input.appearanceId
  })
  const committedTitle = readCardTitleText(input.titleProperty, input.record)
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
    setTitleDraft(readCardTitleText(input.titleProperty, input.record))
    dataView.selection.clear()
    dataView.inlineSession.enter({
      viewId: input.viewId,
      appearanceId: input.appearanceId
    })
  }, [
    dataView.inlineSession,
    dataView.selection,
    input.appearanceId,
    input.record,
    input.titleProperty,
    input.viewId
  ])

  const commitTitle = useCallback(() => {
    if (exitEffectRef.current === 'discard') {
      return
    }

    if (!input.titleProperty) {
      return
    }

    const nextValue = titleDraftRef.current.trim()
    if (nextValue === committedTitleRef.current) {
      return
    }

    committedTitleRef.current = nextValue
    engine.records.setValue(input.record.id, input.titleProperty.id, nextValue)
  }, [
    engine.records,
    input.record.id,
    input.titleProperty
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
        || event.target.appearanceId !== input.appearanceId
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
    input.appearanceId,
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
