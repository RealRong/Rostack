import { impact as commitImpact } from '@dataview/core/commit/impact'
import { document as documentApi } from '@dataview/core/document'
import type {
  CommitImpact,
  DataDoc,
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import { createCollectionDelta } from '@dataview/engine/active/shared/delta'
import type {
  CollectionDelta,
  DocDelta
} from '@dataview/engine/contracts/delta'

const readTouchedIds = <T,>(
  touched: ReadonlySet<T> | 'all',
  all: readonly T[]
): readonly T[] => touched === 'all'
  ? all
  : [...touched]

const buildDocumentCollectionDelta = <Key>(input: {
  previousIds: readonly Key[]
  nextIds: readonly Key[]
  touched?: readonly Key[]
  removed?: readonly Key[]
}): CollectionDelta<Key> | undefined => {
  const removed = input.removed ?? []
  const removedSet = removed.length
    ? new Set(removed)
    : undefined
  const update = (input.touched ?? []).filter(key => !removedSet?.has(key))

  return createCollectionDelta({
    list: !equal.sameOrder(input.previousIds, input.nextIds),
    update,
    remove: removed
  })
}

export const projectDocumentDelta = (input: {
  previous: DataDoc
  next: DataDoc
  impact: CommitImpact
}): DocDelta | undefined => {
  const nextRecordIds = documentApi.records.ids(input.next)
  const nextFieldIds = documentApi.fields.custom.ids(input.next)
  const nextViewIds = documentApi.views.ids(input.next)

  if (input.impact.reset) {
    return {
      meta: true,
      records: createCollectionDelta({
        list: true,
        update: nextRecordIds
      }),
      fields: createCollectionDelta({
        list: true,
        update: nextFieldIds
      }),
      views: createCollectionDelta({
        list: true,
        update: nextViewIds
      })
    }
  }

  const records = buildDocumentCollectionDelta<RecordId>({
    previousIds: documentApi.records.ids(input.previous),
    nextIds: nextRecordIds,
    touched: readTouchedIds(
      commitImpact.record.touchedIds(input.impact),
      nextRecordIds
    ) as readonly RecordId[],
    removed: [...(input.impact.records?.removed ?? [])]
  })
  const fields = buildDocumentCollectionDelta<FieldId>({
    previousIds: documentApi.fields.custom.ids(input.previous),
    nextIds: nextFieldIds,
    touched: readTouchedIds(
      commitImpact.field.schemaIds(input.impact),
      nextFieldIds
    ) as readonly FieldId[],
    removed: [...(input.impact.fields?.removed ?? [])]
  })
  const views = buildDocumentCollectionDelta<ViewId>({
    previousIds: documentApi.views.ids(input.previous),
    nextIds: nextViewIds,
    touched: readTouchedIds(
      commitImpact.view.touchedIds(input.impact),
      nextViewIds
    ) as readonly ViewId[],
    removed: [...(input.impact.views?.removed ?? [])]
  })
  const meta = !equal.sameJsonValue(input.previous.meta, input.next.meta)
    ? true
    : undefined

  return meta || records || fields || views
    ? {
        ...(meta
          ? {
              meta
            }
          : {}),
        ...(records
          ? {
              records
            }
          : {}),
        ...(fields
          ? {
              fields
            }
          : {}),
        ...(views
          ? {
              views
            }
          : {})
      }
    : undefined
}
