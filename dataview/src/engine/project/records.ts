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
