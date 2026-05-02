import type {
  DataDoc,
  FieldId,
  View,
  ViewGroup,
  ViewId
} from '@dataview/core/types'
import type {
  DataviewMutationDelta,
  DataviewQuery,
  DataviewQueryContext
} from '@dataview/core/mutation'
import {
  createDataviewQueryContext
} from '@dataview/core/mutation'
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
  context: DataviewQueryContext
  reader: DataviewQuery
  query: DataviewQuery
  delta: DataviewMutationDelta
  active?: DataviewActiveSpec
}

export const createDataviewFrame = (input: {
  revision: Revision
  document: DataDoc
  delta: DataviewMutationDelta
}): DataviewFrame => {
  const context = createDataviewQueryContext(input.document)

  return {
    revision: input.revision,
    context,
    reader: context.query,
    query: context.query,
    delta: input.delta,
    active: resolveDataviewActive(context, context.activeViewId)
  }
}
