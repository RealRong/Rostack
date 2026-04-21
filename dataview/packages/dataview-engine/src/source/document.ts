import {
  impact as commitImpact
} from '@dataview/core/commit/impact'
import {
  document as documentApi
} from '@dataview/core/document'
import type {
  CommitImpact,
  CustomField,
  DataDoc,
  DataRecord,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  DocumentPatch,
  EnginePatch,
  EntityPatch
} from '@dataview/engine/contracts'

const entityPatch = <TKey, TValue>(input: {
  ids?: readonly TKey[]
  set?: readonly (readonly [TKey, TValue | undefined])[]
  remove?: readonly TKey[]
}): EntityPatch<TKey, TValue> | undefined => (
  input.ids !== undefined || input.set?.length || input.remove?.length
    ? {
        ...(input.ids !== undefined
          ? {
              ids: input.ids
            }
          : {}),
        ...(input.set?.length
          ? {
              set: new Map(input.set)
            }
          : {}),
        ...(input.remove?.length
          ? {
              remove: input.remove
            }
          : {})
      }
    : undefined
)

const buildDocumentEntityPatch = <TKey, TValue>(input: {
  ids: readonly TKey[]
  idsChanged: boolean
  changed: readonly TKey[]
  removed: readonly TKey[]
  value: (key: TKey) => TValue | undefined
}): EntityPatch<TKey, TValue> | undefined => entityPatch({
  ...(input.idsChanged
    ? {
        ids: input.ids
      }
    : {}),
  set: input.changed.map(key => [key, input.value(key)] as const),
  remove: input.removed
})

const readTouchedIds = <T,>(
  touched: ReadonlySet<T> | 'all',
  all: readonly T[]
): readonly T[] => touched === 'all'
  ? all
  : [...touched]

export const projectDocumentPatch = (input: {
  impact: CommitImpact
  document: DataDoc
}): DocumentPatch | undefined => {
  if (input.impact.reset) {
    return {
      records: buildDocumentEntityPatch<RecordId, DataRecord>({
        ids: documentApi.records.ids(input.document),
        idsChanged: true,
        changed: documentApi.records.ids(input.document),
        removed: [],
        value: recordId => documentApi.records.get(input.document, recordId)
      }),
      fields: buildDocumentEntityPatch<FieldId, CustomField>({
        ids: documentApi.fields.custom.ids(input.document),
        idsChanged: true,
        changed: documentApi.fields.custom.ids(input.document),
        removed: [],
        value: fieldId => documentApi.fields.custom.get(input.document, fieldId)
      }),
      views: buildDocumentEntityPatch<ViewId, View>({
        ids: documentApi.views.ids(input.document),
        idsChanged: true,
        changed: documentApi.views.ids(input.document),
        removed: [],
        value: viewId => documentApi.views.get(input.document, viewId)
      })
    }
  }

  const recordIds = readTouchedIds(
    commitImpact.record.touchedIds(input.impact),
    documentApi.records.ids(input.document)
  )
  const fieldIds = readTouchedIds(
    commitImpact.field.schemaIds(input.impact),
    documentApi.fields.custom.ids(input.document)
  )
  const viewIds = readTouchedIds(
    commitImpact.view.touchedIds(input.impact),
    documentApi.views.ids(input.document)
  )

  const records = buildDocumentEntityPatch<RecordId, DataRecord>({
    ids: documentApi.records.ids(input.document),
    idsChanged: Boolean(
      input.impact.records?.inserted?.size
      || input.impact.records?.removed?.size
    ),
    changed: recordIds as readonly RecordId[],
    removed: [...(input.impact.records?.removed ?? [])],
    value: recordId => documentApi.records.get(input.document, recordId)
  })
  const fields = buildDocumentEntityPatch<FieldId, CustomField>({
    ids: documentApi.fields.custom.ids(input.document),
    idsChanged: Boolean(
      input.impact.fields?.inserted?.size
      || input.impact.fields?.removed?.size
    ),
    changed: fieldIds as readonly FieldId[],
    removed: [...(input.impact.fields?.removed ?? [])],
    value: fieldId => documentApi.fields.custom.get(input.document, fieldId)
  })
  const views = buildDocumentEntityPatch<ViewId, View>({
    ids: documentApi.views.ids(input.document),
    idsChanged: Boolean(
      input.impact.views?.inserted?.size
      || input.impact.views?.removed?.size
    ),
    changed: viewIds as readonly ViewId[],
    removed: [...(input.impact.views?.removed ?? [])],
    value: viewId => documentApi.views.get(input.document, viewId)
  })

  return records || fields || views
    ? {
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

export const createEnginePatch = (input: {
  document?: DocumentPatch
  active?: EnginePatch['active']
}): EnginePatch => ({
  ...(input.document
    ? {
        document: input.document
      }
    : {}),
  ...(input.active
    ? {
        active: input.active
      }
    : {})
})
