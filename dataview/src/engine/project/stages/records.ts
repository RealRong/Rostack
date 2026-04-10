import type {
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import type {
  ResolvedViewRecordState
} from '@dataview/core/view'
import type {
  RecordSet
} from '../types'
import type {
  Stage
} from './stage'
import {
  reuse,
  shouldRun
} from './stage'

const toRecordIds = (records: readonly { id: RecordId }[]) => records.map(record => record.id)

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

export const recordsStage: Stage<RecordSet> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    const recordState = input.next.read.recordState()
    return input.next.activeViewId
      ? createRecordSet(input.next.activeViewId, recordState)
      : undefined
  }
}
