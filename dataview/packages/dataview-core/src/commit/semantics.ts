import type {
  DeltaItem,
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
  DataDoc,
  FieldId,
  DataRecord,
  View
} from '@dataview/core/contracts/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts/state'
import {
  sameJsonValue,
  sameOptionalOrder
} from '@shared/core'
import {
  getDocumentCustomFieldById,
  getDocumentRecordById,
  getDocumentViewById
} from '@dataview/core/document'
import {
  sameFilter
} from '@dataview/core/filter'
import {
  sameGroup
} from '@dataview/core/group'
import {
  sameSearch
} from '@dataview/core/search'
import {
  sameSorters
} from '@dataview/core/sort'

const sameIdList = <T extends string>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined
) => sameOptionalOrder(
  left?.length ? left : undefined,
  right?.length ? right : undefined
)

export const collectViewQueryAspects = (
  previousView: View,
  nextView: View
): readonly ViewQueryAspect[] => {
  const aspects = new Set<ViewQueryAspect>()

  if (!sameSearch(previousView.search, nextView.search)) {
    aspects.add('search')
  }
  if (!sameFilter(previousView.filter, nextView.filter)) {
    aspects.add('filter')
  }
  if (!sameSorters(previousView.sort, nextView.sort)) {
    aspects.add('sort')
  }
  if (!sameGroup(previousView.group, nextView.group)) {
    aspects.add('group')
  }
  if (!sameIdList(previousView.orders, nextView.orders)) {
    aspects.add('order')
  }

  return Array.from(aspects)
}

export const collectViewLayoutAspects = (
  previousView: View,
  nextView: View
): readonly ViewLayoutAspect[] => {
  const aspects = new Set<ViewLayoutAspect>()

  if (previousView.name !== nextView.name) {
    aspects.add('name')
  }
  if (previousView.type !== nextView.type) {
    aspects.add('type')
  }
  if (!sameIdList(previousView.display.fields, nextView.display.fields)) {
    aspects.add('display')
  }
  if (!sameJsonValue(previousView.options, nextView.options)) {
    aspects.add('options')
  }

  return Array.from(aspects)
}

export const collectCalculationFields = (
  previousView: View,
  nextView: View
): readonly FieldId[] | undefined => {
  if (sameJsonValue(previousView.calc, nextView.calc)) {
    return undefined
  }

  const fields = new Set<FieldId>([
    ...Object.keys(previousView.calc),
    ...Object.keys(nextView.calc)
  ])

  return fields.size
    ? Array.from(fields).sort()
    : undefined
}

export const collectFieldSchemaAspects = (
  previousField: CustomField | undefined,
  nextField: CustomField | undefined
): readonly FieldSchemaAspect[] => {
  if (!previousField || !nextField) {
    return ['all']
  }

  const aspects = new Set<FieldSchemaAspect>()

  if (previousField.name !== nextField.name) {
    aspects.add('name')
  }
  if (previousField.kind !== nextField.kind) {
    aspects.add('kind')
  }
  if ('options' in previousField || 'options' in nextField) {
    if (!sameJsonValue(
      'options' in previousField ? previousField.options : undefined,
      'options' in nextField ? nextField.options : undefined
    )) {
      aspects.add('options')
    }
  }
  if (!sameJsonValue(previousField.meta, nextField.meta)) {
    aspects.add('meta')
  }

  const previousConfig = {
    ...previousField,
    meta: undefined,
    name: undefined,
    kind: undefined,
    ...('options' in previousField ? { options: undefined } : {})
  }
  const nextConfig = {
    ...nextField,
    meta: undefined,
    name: undefined,
    kind: undefined,
    ...('options' in nextField ? { options: undefined } : {})
  }

  if (!sameJsonValue(previousConfig, nextConfig)) {
    aspects.add('config')
  }

  return aspects.size
    ? Array.from(aspects)
    : ['all']
}

export const collectRecordPatchAspects = (
  previousRecord: DataRecord | undefined,
  nextRecord: DataRecord | undefined
): readonly RecordPatchAspect[] => {
  if (!previousRecord || !nextRecord) {
    return []
  }

  const aspects = new Set<RecordPatchAspect>()

  if (previousRecord.title !== nextRecord.title) {
    aspects.add('title')
  }
  if (previousRecord.type !== nextRecord.type) {
    aspects.add('type')
  }
  if (!sameJsonValue(previousRecord.meta, nextRecord.meta)) {
    aspects.add('meta')
  }

  return Array.from(aspects)
}

const pushUnique = (
  target: DeltaItem[],
  item: DeltaItem
) => {
  const serialized = JSON.stringify(item)
  if (target.some(current => JSON.stringify(current) === serialized)) {
    return
  }

  target.push(item)
}

export const buildSemanticDraft = (input: {
  beforeDocument: DataDoc
  afterDocument: DataDoc
  operations: readonly BaseOperation[]
}): readonly DeltaItem[] => {
  const semantics: DeltaItem[] = []

  if (input.beforeDocument.activeViewId !== input.afterDocument.activeViewId) {
    semantics.push({
      kind: 'activeView.set',
      before: input.beforeDocument.activeViewId,
      after: input.afterDocument.activeViewId
    })
  }

  const touchedViewIds = new Set<string>()
  const touchedFieldIds = new Set<string>()
  const recordAdd = new Set<string>()
  const recordRemove = new Set<string>()
  const valueRecords = new Set<string>()
  const valueFields = new Set<string>()
  const recordPatch = new Map<string, Set<RecordPatchAspect>>()

  input.operations.forEach(operation => {
    switch (operation.type) {
      case 'document.record.insert':
        operation.records.forEach(record => recordAdd.add(record.id))
        return
      case 'document.record.patch': {
        const aspects = collectRecordPatchAspects(
          getDocumentRecordById(input.beforeDocument, operation.recordId),
          getDocumentRecordById(input.afterDocument, operation.recordId)
        )
        if (aspects.length) {
          const current = recordPatch.get(operation.recordId) ?? new Set<RecordPatchAspect>()
          if (!recordPatch.has(operation.recordId)) {
            recordPatch.set(operation.recordId, current)
          }
          aspects.forEach(aspect => current.add(aspect))
        }
        if (operation.patch.values && typeof operation.patch.values === 'object') {
          valueRecords.add(operation.recordId)
          Object.keys(operation.patch.values).forEach(fieldId => valueFields.add(fieldId))
        }
        return
      }
      case 'document.record.remove':
        operation.recordIds.forEach(recordId => recordRemove.add(recordId))
        return
      case 'document.value.set':
        valueRecords.add(operation.recordId)
        valueFields.add(operation.field)
        return
      case 'document.value.patch':
        valueRecords.add(operation.recordId)
        Object.keys(operation.patch).forEach(fieldId => valueFields.add(fieldId))
        return
      case 'document.value.clear':
        valueRecords.add(operation.recordId)
        valueFields.add(operation.field)
        return
      case 'document.view.put':
      case 'document.view.remove':
        touchedViewIds.add(operation.type === 'document.view.put' ? operation.view.id : operation.viewId)
        return
      case 'document.activeView.set':
        return
      case 'document.field.put':
        touchedFieldIds.add(operation.field.id)
        return
      case 'document.field.patch':
      case 'document.field.remove':
        touchedFieldIds.add(operation.fieldId)
        return
      case 'external.version.bump':
        return
    }
  })

  touchedViewIds.forEach(viewId => {
    const previousView = getDocumentViewById(input.beforeDocument, viewId)
    const nextView = getDocumentViewById(input.afterDocument, viewId)
    if (!previousView || !nextView) {
      return
    }

    const queryAspects = collectViewQueryAspects(previousView, nextView)
    if (queryAspects.length) {
      pushUnique(semantics, {
        kind: 'view.query',
        viewId,
        aspects: queryAspects
      })
    }

    const layoutAspects = collectViewLayoutAspects(previousView, nextView)
    if (layoutAspects.length) {
      pushUnique(semantics, {
        kind: 'view.layout',
        viewId,
        aspects: layoutAspects
      })
    }

    const calculationFields = collectCalculationFields(previousView, nextView)
    if (calculationFields?.length) {
      pushUnique(semantics, {
        kind: 'view.calculations',
        viewId,
        fields: calculationFields
      })
    }
  })

  touchedFieldIds.forEach(fieldId => {
    pushUnique(semantics, {
      kind: 'field.schema',
      fieldId,
      aspects: collectFieldSchemaAspects(
        getDocumentCustomFieldById(input.beforeDocument, fieldId),
        getDocumentCustomFieldById(input.afterDocument, fieldId)
      )
    })
  })

  if (recordAdd.size) {
    semantics.push({
      kind: 'record.add',
      ids: Array.from(recordAdd).sort()
    })
  }

  if (recordRemove.size) {
    semantics.push({
      kind: 'record.remove',
      ids: Array.from(recordRemove).sort()
    })
  }

  recordPatch.forEach((aspects, recordId) => {
    if (!aspects.size) {
      return
    }

    semantics.push({
      kind: 'record.patch',
      ids: [recordId],
      aspects: Array.from(aspects)
    })
  })

  if (valueRecords.size || valueFields.size) {
    semantics.push({
      kind: 'record.values',
      records: Array.from(valueRecords).sort(),
      fields: Array.from(valueFields).sort()
    })
  }

  return semantics
}
