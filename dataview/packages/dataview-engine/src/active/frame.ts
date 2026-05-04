import type {
  DataDoc,
  FieldId,
  View,
  ViewGroup,
  ViewId
} from '@dataview/core/types'
import type {
  DataviewMutationChange,
  DataviewQuery,
} from '@dataview/core/mutation'
import {
  createDataviewQuery
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

export interface DataviewResolvedContext {
  document: DataDoc
  query: DataviewQuery
  fieldIds: readonly FieldId[]
  fieldIdSet: ReadonlySet<FieldId>
  activeViewId?: ViewId
  activeView?: View
}

export interface DataviewFrame {
  revision: Revision
  context: DataviewResolvedContext
  query: DataviewQuery
  change: DataviewMutationChange
  active?: DataviewActiveSpec
}

export const createDataviewResolvedContext = (
  document: DataDoc
): DataviewResolvedContext => {
  const query = createDataviewQuery(document)
  const fieldIds = query.fields.ids()
  const activeViewId = query.views.activeId()
  const activeView = activeViewId
    ? query.views.get(activeViewId)
    : undefined

  return {
    document,
    query,
    fieldIds,
    fieldIdSet: new Set<FieldId>(fieldIds),
    activeViewId,
    activeView
  }
}

export const createDataviewFrame = (input: {
  revision: Revision
  document: DataDoc
  change: DataviewMutationChange
}): DataviewFrame => {
  const context = createDataviewResolvedContext(input.document)

  return {
    revision: input.revision,
    context,
    query: context.query,
    change: input.change,
    active: resolveDataviewActive(context, context.activeViewId)
  }
}
