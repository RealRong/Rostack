import type {
  CommitDelta,
  DeltaEntityIds,
  DeltaIds,
  DeltaItem,
  DeltaSummary,
  FieldSchemaAspect,
  RecordPatchAspect,
  ViewLayoutAspect,
  ViewQueryAspect
} from '@dataview/core/contracts/delta'
import type {
  BaseOperation
} from '@dataview/core/contracts/operations'
import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  FieldId,
  RecordId,
  DataRecord,
  View,
  ViewId
} from '@dataview/core/contracts/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts/state'
import {
  getDocumentCustomFieldById,
  getDocumentRecordById,
  getDocumentViewById
} from '@dataview/core/document'
import {
  collectCalculationFields,
  collectFieldSchemaAspects,
  collectRecordPatchAspects,
  collectViewLayoutAspects,
  collectViewQueryAspects
} from '@dataview/core/commit/semantics'

const toSortedArray = <T extends string>(
  values: Set<T>
): readonly T[] | undefined => values.size
  ? Array.from(values).sort()
  : undefined

const mergeIds = <T extends string>(
  current: Set<T> | 'all' | undefined,
  next: readonly T[] | 'all' | undefined
) => {
  if (!next) {
    return current
  }
  if (current === 'all' || next === 'all') {
    return 'all'
  }

  const merged = current ?? new Set<T>()
  next.forEach(value => merged.add(value))
  return merged
}

const createEntityTracker = <T extends string>(
  existsInBase: (id: T) => boolean
) => {
  const add = new Set<T>()
  const update = new Set<T>()
  const remove = new Set<T>()

  return {
    markAdd: (id: T) => {
      remove.delete(id)
      update.delete(id)
      add.add(id)
    },
    markUpdate: (id: T) => {
      if (add.has(id) || remove.has(id)) {
        return
      }

      update.add(id)
    },
    markRemove: (id: T) => {
      if (add.delete(id)) {
        update.delete(id)
        return
      }

      update.delete(id)
      if (existsInBase(id)) {
        remove.add(id)
      }
    },
    build: (): DeltaEntityIds<T> | undefined => {
      const added = toSortedArray(add)
      const updated = toSortedArray(update) as DeltaIds<T> | undefined
      const removed = toSortedArray(remove)

      if (!added && !updated && !removed) {
        return undefined
      }

      return {
        ...(added ? { add: added } : {}),
        ...(updated ? { update: updated } : {}),
        ...(removed ? { remove: removed } : {})
      }
    }
  }
}

export interface DeltaCollector {
  collect: (beforeDocument: DataDoc, afterDocument: DataDoc, operation: BaseOperation) => void
  build: () => CommitDelta
}

export const createDeltaCollector = (
  baseDocument: DataDoc,
  semanticsDraft?: readonly DeltaItem[]
): DeltaCollector => {
  const records = createEntityTracker<RecordId>(id => Boolean(baseDocument.records.byId[id]))
  const fields = createEntityTracker<CustomFieldId>(id => Boolean(baseDocument.fields.byId[id]))
  const views = createEntityTracker<ViewId>(id => Boolean(baseDocument.views.byId[id]))

  let activeViewChange: {
    before?: ViewId
    after?: ViewId
  } | undefined

  const viewQuery = new Map<ViewId, Set<ViewQueryAspect>>()
  const viewLayout = new Map<ViewId, Set<ViewLayoutAspect>>()
  const viewCalculations = new Map<ViewId, Set<FieldId> | 'all'>()
  const fieldSchema = new Map<FieldId, Set<FieldSchemaAspect>>()
  const recordPatch = new Map<RecordId, Set<RecordPatchAspect>>()

  const recordAdd = new Set<RecordId>()
  const recordRemove = new Set<RecordId>()
  const valueRecords = new Set<RecordId>()
  const valueFields = new Set<FieldId>()

  const addMapAspects = <T extends string,>(
    target: Map<string, Set<T>>,
    key: string,
    aspects: readonly T[]
  ) => {
    if (!aspects.length) {
      return
    }

    const current = target.get(key) ?? new Set<T>()
    if (!target.has(key)) {
      target.set(key, current)
    }
    aspects.forEach(aspect => current.add(aspect))
  }

  return {
    collect: (beforeDocument, afterDocument, operation) => {
      if (beforeDocument.activeViewId !== afterDocument.activeViewId) {
        activeViewChange = activeViewChange
          ? {
              before: activeViewChange.before,
              after: afterDocument.activeViewId
            }
          : {
              before: beforeDocument.activeViewId,
              after: afterDocument.activeViewId
            }
      }

      switch (operation.type) {
        case 'document.record.insert': {
          operation.records.forEach(record => {
            records.markAdd(record.id)
            recordAdd.add(record.id)
          })
          return
        }
        case 'document.record.patch': {
          records.markUpdate(operation.recordId)
          const aspects = collectRecordPatchAspects(
            getDocumentRecordById(beforeDocument, operation.recordId),
            getDocumentRecordById(afterDocument, operation.recordId)
          )
          if (aspects.length) {
            addMapAspects(recordPatch as Map<string, Set<RecordPatchAspect>>, operation.recordId, aspects)
          }
          return
        }
        case 'document.record.remove': {
          operation.recordIds.forEach(recordId => {
            records.markRemove(recordId)
            recordRemove.add(recordId)
          })
          return
        }
        case 'document.value.set': {
          valueRecords.add(operation.recordId)
          valueFields.add(operation.field)
          return
        }
        case 'document.value.patch': {
          valueRecords.add(operation.recordId)
          Object.keys(operation.patch).forEach(fieldId => valueFields.add(fieldId))
          return
        }
        case 'document.value.clear': {
          valueRecords.add(operation.recordId)
          valueFields.add(operation.field)
          return
        }
        case 'document.view.put': {
          const previousView = getDocumentViewById(beforeDocument, operation.view.id)
          const nextView = getDocumentViewById(afterDocument, operation.view.id)

          if (!previousView) {
            views.markAdd(operation.view.id)
            return
          }

          views.markUpdate(operation.view.id)
          if (!nextView) {
            return
          }

          addMapAspects(viewQuery as Map<string, Set<ViewQueryAspect>>, nextView.id, collectViewQueryAspects(previousView, nextView))
          addMapAspects(viewLayout as Map<string, Set<ViewLayoutAspect>>, nextView.id, collectViewLayoutAspects(previousView, nextView))

          const calculationFields = collectCalculationFields(previousView, nextView)
          if (calculationFields?.length) {
            viewCalculations.set(
              nextView.id,
              mergeIds(
                viewCalculations.get(nextView.id),
                calculationFields
              ) as Set<FieldId>
            )
          }
          return
        }
        case 'document.activeView.set':
          return
        case 'document.view.remove': {
          views.markRemove(operation.viewId)
          return
        }
        case 'document.field.put': {
          const previousField = getDocumentCustomFieldById(beforeDocument, operation.field.id)
          const nextField = getDocumentCustomFieldById(afterDocument, operation.field.id)

          if (!previousField) {
            fields.markAdd(operation.field.id)
          } else {
            fields.markUpdate(operation.field.id)
          }

          addMapAspects(
            fieldSchema as Map<string, Set<FieldSchemaAspect>>,
            operation.field.id,
            collectFieldSchemaAspects(previousField, nextField)
          )
          return
        }
        case 'document.field.patch': {
          fields.markUpdate(operation.fieldId)
          addMapAspects(
            fieldSchema as Map<string, Set<FieldSchemaAspect>>,
            operation.fieldId,
            collectFieldSchemaAspects(
              getDocumentCustomFieldById(beforeDocument, operation.fieldId),
              getDocumentCustomFieldById(afterDocument, operation.fieldId)
            )
          )
          return
        }
        case 'document.field.remove': {
          fields.markRemove(operation.fieldId)
          addMapAspects(
            fieldSchema as Map<string, Set<FieldSchemaAspect>>,
            operation.fieldId,
            collectFieldSchemaAspects(
              getDocumentCustomFieldById(beforeDocument, operation.fieldId),
              undefined
            )
          )
          return
        }
        case 'external.version.bump':
          return
      }
    },
    build: () => {
      const entities = {
        ...(records.build() ? { records: records.build() } : {}),
        ...(fields.build() ? { fields: fields.build() } : {}),
        ...(views.build() ? { views: views.build() } : {}),
        ...((valueRecords.size || valueFields.size)
          ? {
              values: {
                ...(valueRecords.size
                  ? { records: toSortedArray(valueRecords) as DeltaIds<RecordId> }
                  : {}),
                ...(valueFields.size
                  ? { fields: toSortedArray(valueFields) as DeltaIds<FieldId> }
                  : {})
              }
            }
          : {})
      }

      const semantics: DeltaItem[] = semanticsDraft
        ? [...semanticsDraft]
        : (() => {
            const next: DeltaItem[] = []

            if (activeViewChange) {
              next.push({
                kind: 'activeView.set',
                before: activeViewChange.before,
                after: activeViewChange.after
              })
            }

            viewQuery.forEach((aspects, viewId) => {
              next.push({
                kind: 'view.query',
                viewId,
                aspects: Array.from(aspects)
              })
            })

            viewLayout.forEach((aspects, viewId) => {
              next.push({
                kind: 'view.layout',
                viewId,
                aspects: Array.from(aspects)
              })
            })

            viewCalculations.forEach((fieldsForView, viewId) => {
              next.push({
                kind: 'view.calculations',
                viewId,
                ...(fieldsForView === 'all'
                  ? { fields: 'all' as const }
                  : { fields: Array.from(fieldsForView).sort() })
              })
            })

            fieldSchema.forEach((aspects, fieldId) => {
              next.push({
                kind: 'field.schema',
                fieldId,
                aspects: Array.from(aspects)
              })
            })

            if (recordAdd.size) {
              next.push({
                kind: 'record.add',
                ids: Array.from(recordAdd).sort()
              })
            }

            if (recordRemove.size) {
              next.push({
                kind: 'record.remove',
                ids: Array.from(recordRemove).sort()
              })
            }

            recordPatch.forEach((aspects, recordId) => {
              if (!aspects.size) {
                return
              }

              next.push({
                kind: 'record.patch',
                ids: [recordId],
                aspects: Array.from(aspects)
              })
            })

            if (valueRecords.size || valueFields.size) {
              next.push({
                kind: 'record.values',
                records: toSortedArray(valueRecords) ?? [],
                fields: toSortedArray(valueFields) ?? []
              })
            }

            return next
          })()

      const summary: DeltaSummary = {
        records: Boolean(entities.records),
        fields: Boolean(entities.fields),
        views: Boolean(entities.views),
        values: Boolean(entities.values),
        activeView: semantics.some(item => item.kind === 'activeView.set'),
        indexes: Boolean(entities.records || entities.fields || entities.values || recordPatch.size)
      }

      return {
        summary,
        entities,
        semantics
      }
    }
  }
}
