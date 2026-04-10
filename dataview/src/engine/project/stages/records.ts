import type {
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import type {
  RecordSet
} from '../../types'
import type {
  Stage
} from '../runtime/stage'
import {
  isReconcile,
  reuse,
  shouldRun
} from '../runtime/stage'
import type {
  ResolvedViewRecordState
} from '../runtime/recordState'

const toRecordIds = (records: readonly { id: RecordId }[]) => records.map(record => record.id)

const sameIds = (
  left: readonly RecordId[],
  right: readonly RecordId[]
) => left.length === right.length
  && left.every((value, index) => value === right[index])

export const createRecordSet = (
  activeViewId: ViewId,
  recordState: ResolvedViewRecordState
): RecordSet | undefined => recordState.view
  ? {
      viewId: activeViewId,
      derivedIds: toRecordIds(recordState.derivedRecords),
      orderedIds: toRecordIds(recordState.orderedRecords),
      visibleIds: toRecordIds(recordState.visibleRecords)
    }
  : undefined

const reconcileRecordSet = (
  previous: RecordSet | undefined,
  next: RecordSet | undefined
): RecordSet | undefined => {
  if (!previous || !next || previous.viewId !== next.viewId) {
    return next
  }

  const derivedIds = sameIds(previous.derivedIds, next.derivedIds)
    ? previous.derivedIds
    : next.derivedIds
  const orderedIds = sameIds(previous.orderedIds, next.orderedIds)
    ? previous.orderedIds
    : next.orderedIds
  const visibleIds = sameIds(previous.visibleIds, next.visibleIds)
    ? previous.visibleIds
    : next.visibleIds

  if (
    derivedIds === previous.derivedIds
    && orderedIds === previous.orderedIds
    && visibleIds === previous.visibleIds
  ) {
    return previous
  }

  return {
    viewId: next.viewId,
    derivedIds,
    orderedIds,
    visibleIds
  }
}

export const recordsStage: Stage<RecordSet> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    const recordState = input.next.read.recordState()
    const next = input.next.activeViewId
      ? createRecordSet(input.next.activeViewId, recordState)
      : undefined

    return isReconcile(input.action)
      ? reconcileRecordSet(input.prev, next)
      : next
  }
}
