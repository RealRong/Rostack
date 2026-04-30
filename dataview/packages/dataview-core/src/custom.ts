import {
  documentViews
} from '@dataview/core/document/views'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  createDataviewDraftDocument
} from './custom-draft'
import {
  applyRecordFieldWriteInputToDraft,
  restoreRecordFieldsToDraft
} from './custom-recordFieldDraft'
import type {
  DocumentRecordFieldRestoreEntry,
  DocumentOperation
} from '@dataview/core/op'
import type {
  CustomField,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  FieldOption,
  FilterRule,
  RecordId,
  SortRule,
  View
} from '@dataview/core/types'
import type {
  StatusOption
} from '@dataview/core/types'
import type {
  DocumentReader
} from '@dataview/core/document/reader'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import {
  entityTable,
  equal
} from '@shared/core'
import {
  view as viewApi
} from '@dataview/core/view'
import {
  order
} from '@shared/core'
import {
  applyStructuralOperation,
  createStructuralOrderedDeleteOperation,
  createStructuralOrderedInsertOperation,
  createStructuralOrderedMoveOperation,
  createStructuralOrderedSpliceOperation,
  type MutationDelta,
  type MutationCustomTable,
  type MutationFootprint,
  type MutationOrderedAnchor,
  type MutationStructuralOrderedDeleteOperation,
  type MutationStructuralOrderedInsertOperation,
  type MutationStructuralOrderedMoveOperation,
  type MutationStructuralOrderedSpliceOperation,
  type MutationStructureSource
} from '@shared/mutation'
import {
  applyRecordOrder
} from '@dataview/core/view/order'
import {
  buildViewUpdateOps
} from './compile-view-ops'
import {
  dataviewMutationBuilder,
  type DataviewMutationSchema
} from '@dataview/core/mutation'
import {
  resolveDefaultKanbanGroup,
  setViewType
} from './view/update'
type DataviewMutationIdsKey = Parameters<typeof dataviewMutationBuilder.ids>[0]

const toMutationDelta = (
  delta: MutationDelta | undefined
): MutationDelta | undefined => delta

const createIdsDelta = (
  key: DataviewMutationIdsKey,
  ids: readonly string[]
) => ids.length
  ? toMutationDelta(dataviewMutationBuilder.ids(key, ids) as MutationDelta)
  : undefined

const collectRecordValueFieldIds = (
  record: DataRecord
): readonly FieldId[] => [
  TITLE_FIELD_ID,
  ...Object.keys(record.values) as FieldId[]
]

const createRecordValueDelta = (
  changes: readonly {
    recordId: RecordId
    changedFields: readonly FieldId[]
  }[]
) => {
  const titlePaths: Record<string, readonly string[]> = {}
  const valuePaths: Record<string, readonly string[]> = {}

  changes.forEach((change) => {
    const values: string[] = []

    change.changedFields.forEach((fieldId) => {
      if (fieldId === TITLE_FIELD_ID) {
        titlePaths[change.recordId] = ['title']
        return
      }

      values.push(fieldId)
    })

    if (values.length) {
      valuePaths[change.recordId] = values
    }
  })

  return toMutationDelta(dataviewMutationBuilder.merge(
    Object.keys(titlePaths).length
      ? dataviewMutationBuilder.paths('record.title', titlePaths)
      : undefined,
    Object.keys(valuePaths).length
      ? dataviewMutationBuilder.paths('record.values', valuePaths)
      : undefined
  ) as MutationDelta)
}

const createRecordValueFootprint = (
  recordId: RecordId,
  fieldIds: readonly FieldId[]
): readonly MutationFootprint[] => fieldIds.flatMap((fieldId) => ([
  {
    kind: 'relation',
    family: 'record',
    id: recordId,
    relation: 'values',
    target: fieldId
  },
  {
    kind: 'relation',
    family: 'field',
    id: fieldId,
    relation: 'values',
    target: recordId
  }
]))

const FIELD_OPTIONS_STRUCTURE_PREFIX = 'field.options:'
const VIEW_ORDERS_STRUCTURE_PREFIX = 'view.orders:'
const VIEW_DISPLAY_FIELDS_STRUCTURE_PREFIX = 'view.display.fields:'

const createFieldSchemaDelta = (
  fieldIds: readonly string[]
) => createIdsDelta('field.schema', fieldIds)

const createViewLayoutDelta = (
  viewIds: readonly string[]
) => createIdsDelta('view.layout', viewIds)

const createViewOrdersDelta = (
  viewId: string
) => toMutationDelta(dataviewMutationBuilder.paths('view.query', {
  [viewId]: [{
    aspect: 'order',
    raw: 'orders'
  }]
}) as MutationDelta)

const createViewQueryDelta = (
  viewId: string,
  aspects: readonly ('search' | 'filter' | 'sort' | 'group' | 'order')[]
) => aspects.length
  ? toMutationDelta(dataviewMutationBuilder.paths('view.query', {
      [viewId]: aspects.map((aspect) => ({
        aspect,
        raw: aspect === 'order'
          ? 'orders'
          : aspect
      }))
    }) as MutationDelta)
  : undefined

const createViewCalcDelta = (
  viewIds: readonly string[]
) => createIdsDelta('view.calc', viewIds)

const createEntityFootprint = (
  family: 'field' | 'view',
  id: string
): MutationFootprint => ({
  kind: 'entity',
  family,
  id
})

const readOptionStructure = (
  fieldId: string
) => `${FIELD_OPTIONS_STRUCTURE_PREFIX}${fieldId}`

const readViewOrdersStructure = (
  viewId: string
) => `${VIEW_ORDERS_STRUCTURE_PREFIX}${viewId}`

const readViewDisplayFieldsStructure = (
  viewId: string
) => `${VIEW_DISPLAY_FIELDS_STRUCTURE_PREFIX}${viewId}`

const toOrderedAnchor = (
  before?: string
): MutationOrderedAnchor => before
  ? {
      kind: 'before',
      itemId: before
    }
  : {
      kind: 'end'
    }

const readNextItemId = (
  items: readonly {
    id: string
  }[],
  itemId: string
): string | undefined => {
  const index = items.findIndex((item) => item.id === itemId)
  return index >= 0
    ? items[index + 1]?.id
    : undefined
}

const readNextId = (
  ids: readonly string[],
  id: string
): string | undefined => {
  const index = ids.indexOf(id)
  return index >= 0
    ? ids[index + 1]
    : undefined
}

const toBeforeIdFromAnchor = (
  ids: readonly string[],
  itemId: string,
  anchor: MutationOrderedAnchor
): string | undefined => {
  const remaining = ids.filter((id) => id !== itemId)
  switch (anchor.kind) {
    case 'before':
      return anchor.itemId
    case 'after': {
      const anchorIndex = remaining.indexOf(anchor.itemId)
      return anchorIndex >= 0
        ? remaining[anchorIndex + 1]
        : undefined
    }
    case 'start':
      return remaining[0]
    case 'end':
      return undefined
  }
}

const replaceOptionFieldValues = <TField extends Extract<CustomField, {
  kind: 'select' | 'multiSelect' | 'status'
}>>(
  field: TField,
  options: readonly FieldOption[]
): TField => {
  switch (field.kind) {
    case 'select':
    case 'multiSelect':
      return {
        ...field,
        options: options.map((option) => ({
          id: option.id,
          name: option.name,
          color: option.color ?? null
        }))
      } as TField
    case 'status':
      return {
        ...field,
        options: options.map((option) => ({
          id: option.id,
          name: option.name,
          color: option.color ?? null,
          category: 'category' in option
            ? option.category
            : 'todo'
        })) as StatusOption[]
      } as TField
  }
}

const writeOptionField = (
  document: DataDoc,
  field: Extract<CustomField, { kind: 'select' | 'multiSelect' | 'status' }>
): DataDoc => ({
  ...document,
  fields: entityTable.write.put(document.fields, field)
})

const dataviewStructures: MutationStructureSource<DataDoc> = (
  structure
) => {
  if (!structure.startsWith(FIELD_OPTIONS_STRUCTURE_PREFIX)) {
    if (!structure.startsWith(VIEW_ORDERS_STRUCTURE_PREFIX)) {
      if (!structure.startsWith(VIEW_DISPLAY_FIELDS_STRUCTURE_PREFIX)) {
        return undefined
      }

      const viewId = structure.slice(VIEW_DISPLAY_FIELDS_STRUCTURE_PREFIX.length)
      return {
        kind: 'ordered',
        read: (document: DataDoc) => {
          const view = document.views.byId[viewId]
          if (!view) {
            throw new Error(`View ${viewId} not found.`)
          }
          return view.display.fields
        },
        identify: (fieldId: FieldId) => fieldId,
        clone: (fieldId: FieldId) => fieldId,
        write: (document: DataDoc, fieldIds: readonly FieldId[]) => {
          const view = document.views.byId[viewId]
          if (!view) {
            throw new Error(`View ${viewId} not found.`)
          }

          return {
            ...document,
            views: entityTable.write.put(document.views, {
              ...view,
              display: {
                fields: [...fieldIds]
              }
            })
          }
        }
      }
    }

    if (!structure.startsWith(VIEW_ORDERS_STRUCTURE_PREFIX)) {
      return undefined
    }

    const viewId = structure.slice(VIEW_ORDERS_STRUCTURE_PREFIX.length)
    return {
      kind: 'ordered',
      read: (document: DataDoc) => {
        const view = document.views.byId[viewId]
        if (!view) {
          throw new Error(`View ${viewId} not found.`)
        }
        return applyRecordOrder(document.records.ids, view.orders)
      },
      identify: (recordId: RecordId) => recordId,
      clone: (recordId: RecordId) => recordId,
      write: (document: DataDoc, recordIds: readonly RecordId[]) => {
        const view = document.views.byId[viewId]
        if (!view) {
          throw new Error(`View ${viewId} not found.`)
        }

        return {
          ...document,
          views: entityTable.write.put(document.views, {
            ...view,
            orders: [...recordIds]
          })
        }
      }
    }
  }

  const fieldId = structure.slice(FIELD_OPTIONS_STRUCTURE_PREFIX.length)
  return {
    kind: 'ordered',
    read: (document: DataDoc) => {
      const field = document.fields.byId[fieldId]
      if (!fieldApi.kind.hasOptions(field)) {
        throw new Error(`Field ${fieldId} does not support options.`)
      }
      return field.options
    },
    identify: (option: FieldOption) => option.id,
    clone: (option: FieldOption) => structuredClone(option),
    write: (document: DataDoc, options: readonly FieldOption[]) => {
      const field = document.fields.byId[fieldId]
      if (!fieldApi.kind.hasOptions(field)) {
        throw new Error(`Field ${fieldId} does not support options.`)
      }

      return writeOptionField(document, replaceOptionFieldValues(field, options))
    }
  }
}

const createRecordRemoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'record.remove' }>
) => {
  const removedEntries = operation.recordIds.flatMap((recordId) => {
    const record = document.records.byId[recordId]
    return record
      ? [{ record }]
      : []
  })
  if (!removedEntries.length) {
    return
  }

  const removedRecordIdSet = new Set(removedEntries.map((entry) => entry.record.id))
  const nextRecords = removedEntries.reduce(
    (table, entry) => entityTable.write.remove(table, entry.record.id),
    document.records
  )
  const changedViewOrders: {
    viewId: string
    previousOrder: readonly RecordId[]
  }[] = []
  const nextViews = document.views.ids.reduce((table, viewId) => {
    const view = table.byId[viewId]
    if (!view) {
      return table
    }

    const previousOrder = applyRecordOrder(document.records.ids, view.orders)
    const nextOrder = previousOrder.filter((recordId) => !removedRecordIdSet.has(recordId))
    const changed = nextOrder.length !== previousOrder.length
      || nextOrder.some((recordId, index) => recordId !== previousOrder[index])
    if (!changed) {
      return table
    }

    changedViewOrders.push({
      viewId,
      previousOrder
    })
    return entityTable.write.put(table, {
      ...view,
      orders: nextOrder
    })
  }, document.views)

  const nextDocument: DataDoc = {
    ...document,
    records: nextRecords,
    views: nextViews
  }

  return {
    document: nextDocument,
    delta: toMutationDelta(dataviewMutationBuilder.merge(
      createIdsDelta('record.delete', removedEntries.map((entry) => entry.record.id)),
      createRecordValueDelta(removedEntries.map((entry) => ({
        recordId: entry.record.id,
        changedFields: collectRecordValueFieldIds(entry.record)
      }))),
      ...changedViewOrders.map((entry) => createViewOrdersDelta(entry.viewId))
    ) as MutationDelta),
    footprint: [
      {
        kind: 'global' as const,
        family: 'record'
      },
      ...removedEntries.map((entry) => ({
        kind: 'entity' as const,
        family: 'record',
        id: entry.record.id
      })),
      ...changedViewOrders.map((entry) => createEntityFootprint('view', entry.viewId)),
      ...removedEntries.flatMap((entry) => (
        createRecordValueFootprint(entry.record.id, collectRecordValueFieldIds(entry.record))
      ))
    ],
    history: {
      inverse: [
        ...removedEntries.map((entry) => ({
          type: 'record.create',
          value: entry.record
        } satisfies DocumentOperation)),
        ...changedViewOrders.map((entry) => ({
          type: 'view.order.splice',
          id: entry.viewId,
          records: [...entry.previousOrder]
        } satisfies DocumentOperation))
      ]
    }
  }
}

const createRecordValueWriteResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, {
    type: 'record.values.writeMany' | 'record.values.restoreMany'
  }>
) => {
  const draftDocument = createDataviewDraftDocument(document)
  const changes = operation.type === 'record.values.writeMany'
    ? applyRecordFieldWriteInputToDraft(draftDocument.records, operation)
    : restoreRecordFieldsToDraft(draftDocument.records, operation.entries)

  if (!changes.length) {
    return
  }

  const nextDocument = draftDocument.finish()
  const inverseEntries = changes.map((change): DocumentRecordFieldRestoreEntry => ({
    recordId: change.recordId,
    ...(change.restoreSet
      ? { set: change.restoreSet }
      : {}),
    ...(change.restoreClear?.length
      ? { clear: change.restoreClear }
      : {})
  }))

  return {
    document: nextDocument,
    delta: createRecordValueDelta(changes),
    footprint: changes.flatMap((change) => (
      createRecordValueFootprint(change.recordId, change.changedFields)
    )),
    history: {
      inverse: [{
        type: 'record.values.restoreMany',
        entries: inverseEntries
      } satisfies DocumentOperation]
    }
  }
}

const resolveStatusMoveBefore = (input: {
  field: Extract<CustomField, { kind: 'status' }>
  options: readonly FieldOption[]
  optionId: string
  category: 'todo' | 'in_progress' | 'complete'
}): string | undefined => {
  const remaining = input.options.filter((option) => option.id !== input.optionId)
  const targetCategoryOrder = fieldApi.status.category.order(input.category)
  let nextAfterCategoryId: string | undefined

  for (let index = remaining.length - 1; index >= 0; index -= 1) {
    const option = remaining[index]!
    if (fieldApi.status.category.get(input.field, option.id) === input.category) {
      nextAfterCategoryId = remaining[index + 1]?.id
      break
    }
  }

  if (nextAfterCategoryId !== undefined) {
    return nextAfterCategoryId
  }

  return remaining.find((option) => {
    const category = fieldApi.status.category.get(input.field, option.id)
    return category !== undefined
      && fieldApi.status.category.order(category) > targetCategoryOrder
  })?.id
}

const createFieldOptionInsertResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'field.option.insert' }>
) => {
  const field = document.fields.byId[operation.field]
  if (!fieldApi.kind.hasOptions(field)) {
    return
  }

  const inserted = field.options.find((option) => option.id === operation.option.id)
  if (inserted) {
    return
  }

  const result = applyStructuralOperation<
    DataDoc,
    MutationStructuralOrderedInsertOperation
  >({
    document,
    operation: createStructuralOrderedInsertOperation<MutationStructuralOrderedInsertOperation>({
      structure: readOptionStructure(operation.field),
      itemId: operation.option.id,
      value: structuredClone(operation.option),
      to: toOrderedAnchor(operation.before)
    }),
    structures: dataviewStructures
  })
  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return {
    document: result.data.document,
    delta: createFieldSchemaDelta([operation.field]),
    footprint: [
      createEntityFootprint('field', operation.field),
      ...result.data.footprint
    ],
    history: {
      inverse: [{
        type: 'field.option.delete',
        field: operation.field,
        option: operation.option.id
      } satisfies DocumentOperation]
    }
  }
}

const createFieldOptionMoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'field.option.move' }>
) => {
  const field = document.fields.byId[operation.field]
  if (!fieldApi.kind.hasOptions(field)) {
    return
  }

  const option = field.options.find((entry) => entry.id === operation.option)
  if (!option) {
    return
  }

  const previousBefore = readNextItemId(field.options, option.id)
  const previousCategory = field.kind === 'status'
    ? fieldApi.status.category.get(field, option.id)
    : undefined
  const nextCategory = field.kind === 'status'
    ? operation.category ?? previousCategory
    : undefined

  const normalizedBefore = operation.before === option.id
    ? undefined
    : operation.before
  const before = field.kind === 'status' && nextCategory !== undefined && normalizedBefore === undefined
    ? resolveStatusMoveBefore({
        field,
        options: field.options,
        optionId: option.id,
        category: nextCategory
      })
    : normalizedBefore

  const categoryChanged = field.kind === 'status'
    && nextCategory !== undefined
    && nextCategory !== previousCategory

  const baseDocument = categoryChanged
    ? writeOptionField(document, {
        ...replaceOptionFieldValues(
          field,
          field.options.map((entry) => entry.id === option.id
            ? {
                ...entry,
                category: nextCategory
              }
            : entry)
        )
      })
    : document

  const result = applyStructuralOperation<DataDoc, DocumentOperation>({
    document: baseDocument,
    operation: createStructuralOrderedMoveOperation<DocumentOperation>({
      structure: readOptionStructure(operation.field),
      itemId: option.id,
      to: toOrderedAnchor(before)
    }),
    structures: dataviewStructures
  })
  if (!result.ok) {
    throw new Error(result.error.message)
  }

  if (result.data.historyMode === 'neutral' && !categoryChanged) {
    return
  }

  return {
    document: result.data.document,
    delta: createFieldSchemaDelta([operation.field]),
    footprint: [
      createEntityFootprint('field', operation.field),
      ...result.data.footprint
    ],
    history: {
      inverse: [{
        type: 'field.option.move',
        field: operation.field,
        option: option.id,
        ...(previousBefore !== undefined
          ? { before: previousBefore }
          : {}),
        ...(previousCategory !== undefined
          ? { category: previousCategory }
          : {})
      } satisfies DocumentOperation]
    }
  }
}

const createFieldOptionDeleteResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'field.option.delete' }>
) => {
  const field = document.fields.byId[operation.field]
  if (!fieldApi.kind.hasOptions(field)) {
    return
  }

  const option = field.options.find((entry) => entry.id === operation.option)
  if (!option) {
    return
  }

  const before = readNextItemId(field.options, option.id)
  const result = applyStructuralOperation<
    DataDoc,
    MutationStructuralOrderedDeleteOperation
  >({
    document,
    operation: createStructuralOrderedDeleteOperation<MutationStructuralOrderedDeleteOperation>({
      structure: readOptionStructure(operation.field),
      itemId: option.id
    }),
    structures: dataviewStructures
  })
  if (!result.ok) {
    throw new Error(result.error.message)
  }

  const optionSpec = fieldApi.option.spec.get(field)
  const valueChanges: {
    recordId: RecordId
    changedFields: readonly FieldId[]
  }[] = []
  let nextDocument = result.data.document

  document.records.ids.forEach((recordId) => {
    const record = nextDocument.records.byId[recordId]
    if (!record) {
      return
    }

    const nextValue = optionSpec.projectValueWithoutOption({
      field,
      value: record.values[field.id],
      optionId: option.id
    })
    if (nextValue.kind === 'keep') {
      return
    }

    const nextValues = {
      ...record.values
    }
    if (nextValue.kind === 'clear') {
      delete nextValues[field.id]
    } else {
      nextValues[field.id] = nextValue.value
    }

    nextDocument = {
      ...nextDocument,
      records: entityTable.write.put(nextDocument.records, {
        ...record,
        values: nextValues
      })
    }
    valueChanges.push({
      recordId,
      changedFields: [field.id]
    })
  })

  if (field.kind === 'status' && field.defaultOptionId === option.id) {
    const nextField = nextDocument.fields.byId[field.id]
    if (nextField?.kind === 'status') {
      nextDocument = writeOptionField(nextDocument, {
        ...nextField,
        defaultOptionId: null
      })
    }
  }

  return {
    document: nextDocument,
    delta: toMutationDelta(dataviewMutationBuilder.merge(
      createFieldSchemaDelta([operation.field]),
      createRecordValueDelta(valueChanges)
    ) as MutationDelta),
    footprint: [
      createEntityFootprint('field', operation.field),
      ...result.data.footprint,
      ...valueChanges.flatMap((change) => createRecordValueFootprint(change.recordId, change.changedFields))
    ],
    history: {
      inverse: [
        {
          type: 'field.option.insert',
          field: operation.field,
          option: structuredClone(option),
          ...(before !== undefined
            ? { before }
            : {})
        } satisfies DocumentOperation,
        ...(field.kind === 'status' && field.defaultOptionId === option.id
          ? [{
              type: 'field.patch',
              id: field.id,
              patch: {
                defaultOptionId: option.id
              } as Partial<Omit<CustomField, 'id'>>
            } satisfies DocumentOperation]
          : [])
      ]
    }
  }
}

const ensureKanbanGroup = (
  reader: DocumentReader,
  view: View
): View => {
  if (view.type !== 'kanban' || view.group) {
    return view
  }

  const nextGroup = resolveDefaultKanbanGroup(reader.fields.list())
  return nextGroup
    ? {
        ...view,
        group: viewApi.group.state.clone(nextGroup)!
      }
    : view
}

const sameViewOptions = (
  current: View,
  next: View
): boolean => {
  if (current.type !== next.type) {
    return false
  }

  switch (current.type) {
    case 'table':
      return next.type === 'table'
        ? viewApi.options.same('table', current.options, next.options)
        : false
    case 'gallery':
      return next.type === 'gallery'
        ? viewApi.options.same('gallery', current.options, next.options)
        : false
    case 'kanban':
      return next.type === 'kanban'
        ? viewApi.options.same('kanban', current.options, next.options)
        : false
  }
}

const createViewDelta = (
  current: View,
  next: View
) => {
  const queryAspects: ('search' | 'filter' | 'sort' | 'group' | 'order')[] = []

  if (!viewApi.search.state.same(current.search, next.search)) {
    queryAspects.push('search')
  }
  if (!viewApi.filter.state.same(current.filter, next.filter)) {
    queryAspects.push('filter')
  }
  if (!viewApi.sort.rules.same(current.sort.rules, next.sort.rules)) {
    queryAspects.push('sort')
  }
  if (!viewApi.group.state.same(current.group, next.group)) {
    queryAspects.push('group')
  }
  if (!equal.sameOrder(current.orders, next.orders)) {
    queryAspects.push('order')
  }

  const layoutChanged = (
    current.name !== next.name
    || current.type !== next.type
    || !viewApi.display.same(current.display, next.display)
    || !sameViewOptions(current, next)
  )
  const calcChanged = !viewApi.calc.same(current.calc, next.calc)

  return toMutationDelta(dataviewMutationBuilder.merge(
    createViewQueryDelta(current.id, queryAspects),
    layoutChanged
      ? createViewLayoutDelta([current.id])
      : undefined,
    calcChanged
      ? createViewCalcDelta([current.id])
      : undefined
  ) as MutationDelta)
}

const createViewRewriteResult = (
  document: DataDoc,
  reader: DocumentReader,
  current: View,
  next: View
) => {
  const nextView = ensureKanbanGroup(reader, next)
  if (equal.sameJsonValue(current, nextView)) {
    return
  }

  const inverse = buildViewUpdateOps(nextView, current)
  if (!inverse.length) {
    throw new Error(`Unable to derive inverse operations for view ${current.id}.`)
  }

  return {
    document: {
      ...document,
      views: entityTable.write.put(document.views, nextView)
    },
    delta: createViewDelta(current, nextView),
    footprint: [
      createEntityFootprint('view', current.id)
    ],
    history: {
      inverse
    }
  }
}

const createViewSemanticResult = (
  document: DataDoc,
  reader: DocumentReader,
  operation: Extract<DocumentOperation, {
    type:
      | 'view.rename'
      | 'view.type.set'
      | 'view.search.set'
      | 'view.filter.create'
      | 'view.filter.patch'
      | 'view.filter.move'
      | 'view.filter.mode.set'
      | 'view.filter.remove'
      | 'view.filter.clear'
      | 'view.sort.create'
      | 'view.sort.patch'
      | 'view.sort.move'
      | 'view.sort.remove'
      | 'view.sort.clear'
      | 'view.group.set'
      | 'view.group.clear'
      | 'view.group.toggle'
      | 'view.group.mode.set'
      | 'view.group.sort.set'
      | 'view.group.interval.set'
      | 'view.group.showEmpty.set'
      | 'view.section.show'
      | 'view.section.hide'
      | 'view.section.collapse'
      | 'view.section.expand'
      | 'view.calc.set'
      | 'view.table.widths.set'
      | 'view.table.verticalLines.set'
      | 'view.table.wrap.set'
      | 'view.gallery.wrap.set'
      | 'view.gallery.size.set'
      | 'view.gallery.layout.set'
      | 'view.kanban.wrap.set'
      | 'view.kanban.size.set'
      | 'view.kanban.layout.set'
      | 'view.kanban.fillColor.set'
      | 'view.kanban.cardsPerColumn.set'
  }>
) => {
  const current = document.views.byId[operation.id]
  if (!current) {
    return
  }

  switch (operation.type) {
    case 'view.rename':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        name: operation.name
      })
    case 'view.type.set': {
      const next = setViewType({
        view: current,
        type: operation.viewType,
        fields: reader.fields.list()
      })
      return next
        ? createViewRewriteResult(document, reader, current, next)
        : undefined
    }
    case 'view.search.set':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        search: viewApi.search.state.clone(operation.search)
      })
    case 'view.filter.create': {
      const field = reader.fields.get(operation.rule.fieldId)
      if (!field) {
        return
      }

      const created = viewApi.filter.write.insert(current.filter, field, {
        id: operation.rule.id,
        presetId: operation.rule.presetId,
        ...(Object.prototype.hasOwnProperty.call(operation.rule, 'value')
          ? { value: operation.rule.value }
          : {}),
        ...(operation.before !== undefined
          ? { before: operation.before }
          : {})
      })
      return createViewRewriteResult(document, reader, current, {
        ...current,
        filter: created.filter
      })
    }
    case 'view.filter.patch': {
      const currentRule = current.filter.rules.byId[operation.rule]
      if (!currentRule) {
        return
      }

      const nextFieldId = operation.patch.fieldId ?? currentRule.fieldId
      const field = reader.fields.get(nextFieldId)
      if (!field) {
        return
      }

      return createViewRewriteResult(document, reader, current, {
        ...current,
        filter: viewApi.filter.write.patch(
          current.filter,
          operation.rule,
          operation.patch,
          field
        )
      })
    }
    case 'view.filter.move':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        filter: viewApi.filter.write.move(
          current.filter,
          operation.rule,
          operation.before
        )
      })
    case 'view.filter.mode.set':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        filter: viewApi.filter.write.mode(current.filter, operation.mode)
      })
    case 'view.filter.remove':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        filter: viewApi.filter.write.remove(current.filter, operation.rule)
      })
    case 'view.filter.clear':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        filter: viewApi.filter.write.clear(current.filter)
      })
    case 'view.sort.create':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        sort: viewApi.sort.write.insert(current.sort, {
          id: operation.rule.id,
          fieldId: operation.rule.fieldId,
          direction: operation.rule.direction,
          ...(operation.before !== undefined
            ? { before: operation.before }
            : {})
        }).sort
      })
    case 'view.sort.patch':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        sort: viewApi.sort.write.patch(
          current.sort,
          operation.rule,
          operation.patch
        )
      })
    case 'view.sort.move':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        sort: viewApi.sort.write.move(
          current.sort,
          operation.rule,
          operation.before
        )
      })
    case 'view.sort.remove':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        sort: viewApi.sort.write.remove(current.sort, operation.rule)
      })
    case 'view.sort.clear':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        sort: viewApi.sort.write.clear(current.sort)
      })
    case 'view.group.set':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        group: viewApi.group.state.clone(operation.group)
      } as View)
    case 'view.group.clear':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        group: viewApi.group.clear(current.group)
      } as View)
    case 'view.group.toggle': {
      const field = reader.fields.get(operation.field)
      if (!field) {
        return
      }

      return createViewRewriteResult(document, reader, current, {
        ...current,
        group: viewApi.group.toggle(current.group, field)
      } as View)
    }
    case 'view.group.mode.set':
    case 'view.group.sort.set':
    case 'view.group.interval.set':
    case 'view.group.showEmpty.set': {
      const fieldId = current.group?.fieldId
      const field = fieldId
        ? reader.fields.get(fieldId)
        : undefined
      if (!field) {
        return
      }

      const group = operation.type === 'view.group.mode.set'
        ? viewApi.group.patch(current.group, field, {
            mode: operation.mode
          })
        : operation.type === 'view.group.sort.set'
          ? viewApi.group.patch(current.group, field, {
              bucketSort: operation.sort
            })
          : operation.type === 'view.group.interval.set'
            ? viewApi.group.patch(current.group, field, {
                bucketInterval: operation.interval
              })
            : viewApi.group.patch(current.group, field, {
                showEmpty: operation.value
              })
      return group
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            group
          })
        : undefined
    }
    case 'view.section.show':
    case 'view.section.hide':
    case 'view.section.collapse':
    case 'view.section.expand': {
      const fieldId = current.group?.fieldId
      const field = fieldId
        ? reader.fields.get(fieldId)
        : undefined
      if (!field) {
        return
      }

      const nextGroup = viewApi.group.bucket.patch(
        current.group,
        field,
        operation.bucket,
        operation.type === 'view.section.show'
          ? { hidden: false }
          : operation.type === 'view.section.hide'
            ? { hidden: true }
            : operation.type === 'view.section.collapse'
              ? { collapsed: true }
              : { collapsed: false }
      )
      return nextGroup
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            group: nextGroup
          })
        : undefined
    }
    case 'view.calc.set':
      return createViewRewriteResult(document, reader, current, {
        ...current,
        calc: viewApi.calc.set(current.calc, operation.field, operation.metric ?? null)
      })
    case 'view.table.widths.set':
      return current.type === 'table'
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            options: viewApi.layout.table.patch(current.options, {
              widths: operation.widths
            })
          })
        : undefined
    case 'view.table.verticalLines.set':
      return current.type === 'table'
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            options: viewApi.layout.table.patch(current.options, {
              showVerticalLines: operation.value
            })
          })
        : undefined
    case 'view.table.wrap.set':
      return current.type === 'table'
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            options: viewApi.layout.table.patch(current.options, {
              wrap: operation.value
            })
          })
        : undefined
    case 'view.gallery.wrap.set':
      return current.type === 'gallery'
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            options: viewApi.layout.gallery.patch(current.options, {
              card: {
                wrap: operation.value
              }
            })
          })
        : undefined
    case 'view.gallery.size.set':
      return current.type === 'gallery'
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            options: viewApi.layout.gallery.patch(current.options, {
              card: {
                size: operation.value
              }
            })
          })
        : undefined
    case 'view.gallery.layout.set':
      return current.type === 'gallery'
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            options: viewApi.layout.gallery.patch(current.options, {
              card: {
                layout: operation.value
              }
            })
          })
        : undefined
    case 'view.kanban.wrap.set':
      return current.type === 'kanban'
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            options: viewApi.layout.kanban.patch(current.options, {
              card: {
                wrap: operation.value
              }
            })
          })
        : undefined
    case 'view.kanban.size.set':
      return current.type === 'kanban'
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            options: viewApi.layout.kanban.patch(current.options, {
              card: {
                size: operation.value
              }
            })
          })
        : undefined
    case 'view.kanban.layout.set':
      return current.type === 'kanban'
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            options: viewApi.layout.kanban.patch(current.options, {
              card: {
                layout: operation.value
              }
            })
          })
        : undefined
    case 'view.kanban.fillColor.set':
      return current.type === 'kanban'
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            options: viewApi.layout.kanban.patch(current.options, {
              fillColumnColor: operation.value
            })
          })
        : undefined
    case 'view.kanban.cardsPerColumn.set':
      return current.type === 'kanban'
        ? createViewRewriteResult(document, reader, current, {
            ...current,
            options: viewApi.layout.kanban.patch(current.options, {
              cardsPerColumn: operation.value
            })
          })
        : undefined
  }
}

const createViewOrderMoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'view.order.move' }>
) => {
  const view = document.views.byId[operation.id]
  if (!view || !document.records.byId[operation.record]) {
    return
  }

  const currentOrder = applyRecordOrder(document.records.ids, view.orders)
  const previousBefore = readNextId(currentOrder, operation.record)
  const result = applyStructuralOperation<DataDoc, DocumentOperation>({
    document,
    operation: createStructuralOrderedMoveOperation<DocumentOperation>({
      structure: readViewOrdersStructure(operation.id),
      itemId: operation.record,
      to: toOrderedAnchor(operation.before)
    }),
    structures: dataviewStructures
  })
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  if (result.data.historyMode === 'neutral') {
    return
  }

  return {
    document: result.data.document,
    delta: createViewOrdersDelta(operation.id),
    footprint: [
      createEntityFootprint('view', operation.id),
      ...result.data.footprint
    ],
    history: {
      inverse: [{
        type: 'view.order.move',
        id: operation.id,
        record: operation.record,
        ...(previousBefore !== undefined
          ? { before: previousBefore }
          : {})
      } satisfies DocumentOperation]
    }
  }
}

const createViewOrderSpliceInverse = (input: {
  currentIds: readonly RecordId[]
  inverse: readonly MutationStructuralOrderedMoveOperation[]
  viewId: string
}) => {
  let working = [...input.currentIds]
  const inverseOps: DocumentOperation[] = []

  input.inverse.forEach((operation) => {
    if (operation.type !== 'structural.ordered.move') {
      return
    }

    const before = toBeforeIdFromAnchor(working, operation.itemId, operation.to)
    inverseOps.push({
      type: 'view.order.move',
      id: input.viewId,
      record: operation.itemId as RecordId,
      ...(before !== undefined
        ? { before: before as RecordId }
        : {})
    })
    working = order.moveItem(working, operation.itemId as RecordId, {
      ...(before !== undefined
        ? { before: before as RecordId }
        : {})
    })
  })

  return inverseOps
}

const createViewOrderSpliceResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'view.order.splice' }>
) => {
  const view = document.views.byId[operation.id]
  if (!view) {
    return
  }

  const currentOrder = applyRecordOrder(document.records.ids, view.orders)
  const movingRecords = operation.records.filter((recordId, index, ids) => (
    document.records.byId[recordId]
    && ids.indexOf(recordId) === index
  ))
  if (!movingRecords.length) {
    return
  }

  const result = applyStructuralOperation<
    DataDoc,
    MutationStructuralOrderedSpliceOperation | MutationStructuralOrderedMoveOperation
  >({
    document,
    operation: createStructuralOrderedSpliceOperation<MutationStructuralOrderedSpliceOperation>({
      structure: readViewOrdersStructure(operation.id),
      itemIds: movingRecords,
      to: toOrderedAnchor(operation.before)
    }),
    structures: dataviewStructures
  })
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  if (result.data.historyMode === 'neutral') {
    return
  }

  return {
    document: result.data.document,
    delta: createViewOrdersDelta(operation.id),
    footprint: [
      createEntityFootprint('view', operation.id),
      ...result.data.footprint
    ],
    history: {
      inverse: createViewOrderSpliceInverse({
        currentIds: applyRecordOrder(result.data.document.records.ids, result.data.document.views.byId[operation.id]?.orders ?? []),
        inverse: result.data.inverse as unknown as readonly MutationStructuralOrderedMoveOperation[],
        viewId: operation.id
      })
    }
  }
}

const createViewDisplayMoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'view.display.move' }>
) => {
  const view = document.views.byId[operation.id]
  if (!view || !view.display.fields.includes(operation.field)) {
    return
  }

  const previousBefore = readNextId(view.display.fields, operation.field)
  const result = applyStructuralOperation<DataDoc, DocumentOperation>({
    document,
    operation: createStructuralOrderedMoveOperation<DocumentOperation>({
      structure: readViewDisplayFieldsStructure(operation.id),
      itemId: operation.field,
      to: toOrderedAnchor(operation.before)
    }),
    structures: dataviewStructures
  })
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  if (result.data.historyMode === 'neutral') {
    return
  }

  return {
    document: result.data.document,
    delta: createViewLayoutDelta([operation.id]),
    footprint: [
      createEntityFootprint('view', operation.id),
      ...result.data.footprint
    ],
    history: {
      inverse: [{
        type: 'view.display.move',
        id: operation.id,
        field: operation.field,
        ...(previousBefore !== undefined
          ? { before: previousBefore as FieldId }
          : {})
      } satisfies DocumentOperation]
    }
  }
}

const createViewDisplaySpliceInverse = (input: {
  currentIds: readonly FieldId[]
  inverse: readonly MutationStructuralOrderedMoveOperation[]
  viewId: string
}) => {
  let working = [...input.currentIds]
  const inverseOps: DocumentOperation[] = []

  input.inverse.forEach((operation) => {
    const before = toBeforeIdFromAnchor(working, operation.itemId, operation.to)
    inverseOps.push({
      type: 'view.display.move',
      id: input.viewId,
      field: operation.itemId as FieldId,
      ...(before !== undefined
        ? { before: before as FieldId }
        : {})
    })
    working = order.moveItem(working, operation.itemId as FieldId, {
      ...(before !== undefined
        ? { before: before as FieldId }
        : {})
    })
  })

  return inverseOps
}

const createViewDisplaySpliceResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'view.display.splice' }>
) => {
  const view = document.views.byId[operation.id]
  if (!view) {
    return
  }

  const movingFields = operation.fields.filter((fieldId, index, ids) => (
    view.display.fields.includes(fieldId)
    && ids.indexOf(fieldId) === index
  ))
  if (!movingFields.length) {
    return
  }

  const result = applyStructuralOperation<
    DataDoc,
    MutationStructuralOrderedSpliceOperation | MutationStructuralOrderedMoveOperation
  >({
    document,
    operation: createStructuralOrderedSpliceOperation<MutationStructuralOrderedSpliceOperation>({
      structure: readViewDisplayFieldsStructure(operation.id),
      itemIds: movingFields,
      to: toOrderedAnchor(operation.before)
    }),
    structures: dataviewStructures
  })
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  if (result.data.historyMode === 'neutral') {
    return
  }

  return {
    document: result.data.document,
    delta: createViewLayoutDelta([operation.id]),
    footprint: [
      createEntityFootprint('view', operation.id),
      ...result.data.footprint
    ],
    history: {
      inverse: createViewDisplaySpliceInverse({
        currentIds: result.data.document.views.byId[operation.id]?.display.fields ?? [],
        inverse: result.data.inverse as unknown as readonly MutationStructuralOrderedMoveOperation[],
        viewId: operation.id
      })
    }
  }
}

const createViewDisplayShowResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'view.display.show' }>
) => {
  const view = document.views.byId[operation.id]
  if (!view || !document.fields.byId[operation.field]) {
    return
  }

  if (view.display.fields.includes(operation.field)) {
    return createViewDisplayMoveResult(document, {
      type: 'view.display.move',
      id: operation.id,
      field: operation.field,
      ...(operation.before !== undefined
        ? { before: operation.before }
        : {})
    })
  }

  const result = applyStructuralOperation<
    DataDoc,
    MutationStructuralOrderedInsertOperation
  >({
    document,
    operation: createStructuralOrderedInsertOperation<MutationStructuralOrderedInsertOperation>({
      structure: readViewDisplayFieldsStructure(operation.id),
      itemId: operation.field,
      value: operation.field,
      to: toOrderedAnchor(operation.before)
    }),
    structures: dataviewStructures
  })
  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return {
    document: result.data.document,
    delta: createViewLayoutDelta([operation.id]),
    footprint: [
      createEntityFootprint('view', operation.id),
      ...result.data.footprint
    ],
    history: {
      inverse: [{
        type: 'view.display.hide',
        id: operation.id,
        field: operation.field
      } satisfies DocumentOperation]
    }
  }
}

const createViewDisplayHideResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'view.display.hide' }>
) => {
  const view = document.views.byId[operation.id]
  if (!view || !view.display.fields.includes(operation.field)) {
    return
  }

  const before = readNextId(view.display.fields, operation.field)
  const result = applyStructuralOperation<
    DataDoc,
    MutationStructuralOrderedDeleteOperation
  >({
    document,
    operation: createStructuralOrderedDeleteOperation<MutationStructuralOrderedDeleteOperation>({
      structure: readViewDisplayFieldsStructure(operation.id),
      itemId: operation.field
    }),
    structures: dataviewStructures
  })
  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return {
    document: result.data.document,
    delta: createViewLayoutDelta([operation.id]),
    footprint: [
      createEntityFootprint('view', operation.id),
      ...result.data.footprint
    ],
    history: {
      inverse: [{
        type: 'view.display.show',
        id: operation.id,
        field: operation.field,
        ...(before !== undefined
          ? { before: before as FieldId }
          : {})
      } satisfies DocumentOperation]
    }
  }
}

const createViewDisplayClearResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'view.display.clear' }>
) => {
  const view = document.views.byId[operation.id]
  if (!view || !view.display.fields.length) {
    return
  }

  let nextDocument = document
  const footprint: MutationFootprint[] = [createEntityFootprint('view', operation.id)]

  view.display.fields.forEach((fieldId) => {
    const result = applyStructuralOperation<
      DataDoc,
      MutationStructuralOrderedDeleteOperation
    >({
      document: nextDocument,
      operation: createStructuralOrderedDeleteOperation<MutationStructuralOrderedDeleteOperation>({
        structure: readViewDisplayFieldsStructure(operation.id),
        itemId: fieldId
      }),
      structures: dataviewStructures
    })
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    nextDocument = result.data.document
    footprint.push(...result.data.footprint)
  })

  return {
    document: nextDocument,
    delta: createViewLayoutDelta([operation.id]),
    footprint,
    history: {
      inverse: view.display.fields.map((fieldId) => ({
        type: 'view.display.show',
        id: operation.id,
        field: fieldId
      } satisfies DocumentOperation))
    }
  }
}

const createFieldRemoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'field.remove' }>
) => {
  const beforeField = document.fields.byId[operation.id]
  if (!beforeField) {
    return
  }

  const affectedRecords = document.records.ids.flatMap((recordId) => {
    const record = document.records.byId[recordId]
    return record && Object.prototype.hasOwnProperty.call(record.values, operation.id)
      ? [{
          recordId,
          changedFields: [operation.id] as const
        }]
      : []
  })

  const nextRecords = affectedRecords.reduce((table, change) => {
    const current = table.byId[change.recordId]
    if (!current) {
      return table
    }

    const nextValues = {
      ...current.values
    }
    delete nextValues[operation.id]
    return entityTable.write.put(table, {
      ...current,
      values: nextValues
    })
  }, document.records)

  const nextDocument: DataDoc = {
    ...document,
    fields: entityTable.write.remove(document.fields, operation.id),
    records: nextRecords
  }

  return {
    document: nextDocument,
    delta: toMutationDelta(dataviewMutationBuilder.merge(
      createIdsDelta('field.delete', [operation.id]),
      createRecordValueDelta(affectedRecords)
    ) as MutationDelta),
    footprint: [
      {
        kind: 'global' as const,
        family: 'field'
      },
      {
        kind: 'entity' as const,
        family: 'field',
        id: operation.id
      },
      ...affectedRecords.flatMap((change) => (
        createRecordValueFootprint(change.recordId, change.changedFields)
      ))
    ],
    history: {
      inverse: [{
        type: 'field.create',
        value: beforeField
      } satisfies DocumentOperation]
    }
  }
}

const createViewOpenResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'view.open' }>
) => {
  const beforeViewId = document.activeViewId
  const nextDocument = documentViews.activeId.set(document, operation.id)
  if (beforeViewId === nextDocument.activeViewId) {
    return
  }

  return {
    document: nextDocument,
    delta: toMutationDelta(dataviewMutationBuilder.flag('document.activeViewId') as MutationDelta),
    footprint: [{
      kind: 'global' as const,
      family: 'document'
    }],
    history: {
      inverse: [{
        type: 'document.patch',
        patch: {
          activeViewId: beforeViewId
        }
      } satisfies DocumentOperation]
    }
  }
}

const createViewRemoveResult = (
  document: DataDoc,
  operation: Extract<DocumentOperation, { type: 'view.remove' }>
) => {
  const beforeView = document.views.byId[operation.id]
  if (!beforeView) {
    return
  }

  const beforeActiveViewId = document.activeViewId
  const nextDocument = documentViews.remove(document, operation.id)
  const inverse: DocumentOperation[] = [{
    type: 'view.create',
    value: beforeView
  }]
  const deltaInputs = [
    createIdsDelta('view.delete', [operation.id]),
    beforeActiveViewId !== nextDocument.activeViewId
      ? toMutationDelta(dataviewMutationBuilder.flag('document.activeViewId') as MutationDelta)
      : undefined
  ] as const

  if (beforeActiveViewId !== nextDocument.activeViewId) {
    inverse.push({
      type: 'document.patch',
      patch: {
        activeViewId: beforeActiveViewId
      }
    })
  }

  return {
    document: nextDocument,
    delta: toMutationDelta(dataviewMutationBuilder.merge(...deltaInputs) as MutationDelta),
    footprint: [
      {
        kind: 'global' as const,
        family: 'view'
      },
      {
        kind: 'entity' as const,
        family: 'view',
        id: operation.id
      }
    ],
    history: {
      inverse
    }
  }
}

const createExternalVersionResult = (
  operation: Extract<DocumentOperation, { type: 'external.version.bump' }>
) => ({
  delta: toMutationDelta(dataviewMutationBuilder.flag('external.version') as MutationDelta),
  footprint: [] as const,
  history: false as const,
  outputs: [operation.source]
})

export const dataviewCustom: MutationCustomTable<
  DataDoc,
  DocumentOperation,
  DocumentReader,
  void
> = {
  'record.remove': {
    reduce: ({ op, document }) => createRecordRemoveResult(document, op)
  },
  'record.values.writeMany': {
    reduce: ({ op, document }) => createRecordValueWriteResult(document, op)
  },
  'record.values.restoreMany': {
    reduce: ({ op, document }) => createRecordValueWriteResult(document, op)
  },
  'field.option.insert': {
    reduce: ({ op, document }) => createFieldOptionInsertResult(document, op)
  },
  'field.option.move': {
    reduce: ({ op, document }) => createFieldOptionMoveResult(document, op)
  },
  'field.option.delete': {
    reduce: ({ op, document }) => createFieldOptionDeleteResult(document, op)
  },
  'field.remove': {
    reduce: ({ op, document }) => createFieldRemoveResult(document, op)
  },
  'view.rename': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.type.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.search.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.filter.create': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.filter.patch': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.filter.move': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.filter.mode.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.filter.remove': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.filter.clear': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.sort.create': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.sort.patch': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.sort.move': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.sort.remove': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.sort.clear': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.group.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.group.clear': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.group.toggle': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.group.mode.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.group.sort.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.group.interval.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.group.showEmpty.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.section.show': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.section.hide': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.section.collapse': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.section.expand': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.calc.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.table.widths.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.table.verticalLines.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.table.wrap.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.gallery.wrap.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.gallery.size.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.gallery.layout.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.kanban.wrap.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.kanban.size.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.kanban.layout.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.kanban.fillColor.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.kanban.cardsPerColumn.set': {
    reduce: ({ op, document, reader }) => createViewSemanticResult(document, reader, op)
  },
  'view.order.move': {
    reduce: ({ op, document }) => createViewOrderMoveResult(document, op)
  },
  'view.order.splice': {
    reduce: ({ op, document }) => createViewOrderSpliceResult(document, op)
  },
  'view.display.move': {
    reduce: ({ op, document }) => createViewDisplayMoveResult(document, op)
  },
  'view.display.splice': {
    reduce: ({ op, document }) => createViewDisplaySpliceResult(document, op)
  },
  'view.display.show': {
    reduce: ({ op, document }) => createViewDisplayShowResult(document, op)
  },
  'view.display.hide': {
    reduce: ({ op, document }) => createViewDisplayHideResult(document, op)
  },
  'view.display.clear': {
    reduce: ({ op, document }) => createViewDisplayClearResult(document, op)
  },
  'view.open': {
    reduce: ({ op, document }) => createViewOpenResult(document, op)
  },
  'view.remove': {
    reduce: ({ op, document }) => createViewRemoveResult(document, op)
  },
  'external.version.bump': {
    reduce: ({ op }) => createExternalVersionResult(op)
  }
}

export {
  dataviewCustom as custom
}
