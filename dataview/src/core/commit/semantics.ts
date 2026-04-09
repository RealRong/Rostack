import type {
  DeltaItem,
  FieldSchemaAspect,
  RecordPatchAspect,
  ViewLayoutAspect,
  ViewQueryAspect
} from '../contracts/delta'
import type {
  BaseOperation
} from '../contracts/operations'
import type {
  CustomField,
  DataDoc,
  FieldId,
  Row,
  View
} from '../contracts/state'
import {
  TITLE_FIELD_ID
} from '../contracts/state'
import {
  getDocumentCustomFieldById,
  getDocumentRecordById,
  getDocumentViewById
} from '../document'
import {
  sameFilter
} from '../filter'
import {
  sameGroup
} from '../group'
import {
  sameSearch
} from '../search'
import {
  sameSorters
} from '../sort'

const sameIdList = <T extends string>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined
) => {
  if (!left?.length && !right?.length) {
    return true
  }

  if (!left || !right || left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

const stableSerialize = (value: unknown): string => {
  if (value === undefined) {
    return 'undefined'
  }
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableSerialize(nestedValue)}`)
    return `{${entries.join(',')}}`
  }

  return String(value)
}

const sameStableValue = (
  left: unknown,
  right: unknown
) => stableSerialize(left) === stableSerialize(right)

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
  if (!sameStableValue(previousView.options, nextView.options)) {
    aspects.add('options')
  }

  return Array.from(aspects)
}

export const collectCalculationFields = (
  previousView: View,
  nextView: View
): readonly FieldId[] | undefined => {
  if (sameStableValue(previousView.calc, nextView.calc)) {
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
    if (!sameStableValue(
      'options' in previousField ? previousField.options : undefined,
      'options' in nextField ? nextField.options : undefined
    )) {
      aspects.add('options')
    }
  }
  if (!sameStableValue(previousField.meta, nextField.meta)) {
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

  if (!sameStableValue(previousConfig, nextConfig)) {
    aspects.add('config')
  }

  return aspects.size
    ? Array.from(aspects)
    : ['all']
}

export const collectRecordPatchAspects = (
  previousRecord: Row | undefined,
  nextRecord: Row | undefined
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
  if (!sameStableValue(previousRecord.meta, nextRecord.meta)) {
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
      case 'document.customField.put':
        touchedFieldIds.add(operation.field.id)
        return
      case 'document.customField.patch':
      case 'document.customField.remove':
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
