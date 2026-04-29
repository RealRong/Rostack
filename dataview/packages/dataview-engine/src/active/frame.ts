import type {
  DataDoc,
  FieldId,
  View,
  ViewGroup,
  ViewId
} from '@dataview/core/types'
import type {
  QueryPlan
} from '@dataview/engine/active/plan'
import {
  resolveDataviewActive
} from '@dataview/engine/active/plan'
import type {
  NormalizedIndexDemand
} from '@dataview/engine/active/index/contracts'
import type {
  DataviewMutationDelta
} from '@dataview/engine/mutation/delta'
import {
  createDocumentReadContext,
  type DocumentReader
} from '@dataview/core/document/reader'
import type {
  Revision
} from '@shared/projection'

export interface DataviewActiveSpec {
  id: ViewId
  view: View
  demand: NormalizedIndexDemand
  query: QueryPlan
  section?: {
    fieldId: FieldId
    mode?: ViewGroup['mode']
    sort?: ViewGroup['bucketSort']
    interval?: ViewGroup['bucketInterval']
    showEmpty: boolean
  }
  calcFields: readonly FieldId[]
}

export interface DataviewFrame {
  revision: Revision
  reader: DocumentReader
  delta: DataviewMutationDelta
  active?: DataviewActiveSpec
}

export const createDataviewFrame = (input: {
  revision: Revision
  document: DataDoc
  delta: DataviewMutationDelta
}): DataviewFrame => {
  const context = createDocumentReadContext(input.document)

  return {
    revision: input.revision,
    reader: context.reader,
    delta: input.delta,
    active: resolveDataviewActive(context, context.activeViewId)
  }
}
