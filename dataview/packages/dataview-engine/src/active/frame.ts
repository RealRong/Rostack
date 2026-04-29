import type {
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
  DataviewMutationDelta,
  DataviewQueryAspect
} from '@dataview/engine/mutation/delta'
import {
  createDocumentReadContext,
  type DocumentReader
} from '@dataview/engine/document/reader'
import type {
  Revision
} from '@shared/projection'

export interface DataviewActiveFrame {
  id: ViewId
  view: View
  demand: NormalizedIndexDemand
  query: {
    plan: QueryPlan
    changed(aspect?: DataviewQueryAspect): boolean
  }
  section?: {
    fieldId: FieldId
    mode?: ViewGroup['mode']
    sort?: ViewGroup['bucketSort']
    interval?: ViewGroup['bucketInterval']
    showEmpty: boolean
  }
  calc: {
    fields: readonly FieldId[]
    changed(): boolean
  }
}

export interface DataviewFrame {
  revision: Revision
  reader: DocumentReader
  delta: DataviewMutationDelta
  active?: DataviewActiveFrame
}

export const createDataviewFrame = (input: {
  revision: Revision
  document: import('@dataview/core/types').DataDoc
  delta: DataviewMutationDelta
}): DataviewFrame => {
  const context = createDocumentReadContext(input.document)
  const active = resolveDataviewActive(context, context.activeViewId)

  return {
    revision: input.revision,
    reader: context.reader,
    delta: input.delta,
    ...(active
      ? {
          active: {
            id: active.id,
            view: active.view,
            demand: active.demand,
            query: {
              plan: active.query,
              changed: (aspect?: DataviewQueryAspect) => input.delta.view.query(active.id).changed(aspect)
            },
            ...(active.section
              ? {
                  section: active.section
                }
              : {}),
            calc: {
              fields: active.calcFields,
              changed: () => input.delta.view.calc(active.id).changed()
            }
          } satisfies DataviewActiveFrame
        }
      : {})
  }
}
