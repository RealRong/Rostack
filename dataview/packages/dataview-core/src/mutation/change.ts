import type {
  FieldId,
  RecordId,
  ViewId,
} from '@dataview/core/types'
import {
  TITLE_FIELD_ID
} from '@dataview/core/types'
import {
  extendMutationChange,
  getCompiledMutationSchema,
  type MutationChange,
  type MutationWrite,
} from '@shared/mutation'
import {
  dataviewMutationSchema,
  type DataviewMutationSchema,
} from './schema'
import type {
  DataviewQuery
} from './query'

export type DataviewQueryAspect =
  | 'search'
  | 'filter'
  | 'sort'
  | 'group'
  | 'order'

type TouchedIds<TId extends string> = ReadonlySet<TId> | 'all'

export type DataviewMutationFactKind =
  | 'record.insert'
  | 'record.title'
  | 'record.type'
  | 'record.meta'
  | 'record.remove'
  | 'record.value'
  | 'field.insert'
  | 'field.remove'
  | 'field.schema'
  | 'view.insert'
  | 'view.change'
  | 'view.layout'
  | 'view.calc'
  | 'view.remove'
  | 'activeView.set'
  | 'reset'

export type DataviewMutationFact = {
  kind: DataviewMutationFactKind
  count?: number
}

type DataviewMutationFactCount = number | 'all'

const DATAVIEW_MUTATION_FACT_ORDER: readonly DataviewMutationFactKind[] = [
  'record.insert',
  'record.title',
  'record.type',
  'record.meta',
  'record.remove',
  'record.value',
  'field.insert',
  'field.remove',
  'field.schema',
  'view.insert',
  'view.change',
  'view.layout',
  'view.calc',
  'view.remove',
  'activeView.set',
  'reset'
]

export type DataviewMutationChangeExtension = {
  record: {
    setChanged(): boolean
    touchedIds(): TouchedIds<RecordId>
    values: {
      touchedFieldIds(): TouchedIds<FieldId>
    }
  }
  field: {
    touchedIds(): TouchedIds<FieldId>
    schemaTouchedIds(): TouchedIds<FieldId>
    schemaChanged(fieldId?: FieldId): boolean
  }
  view: {
    touchedIds(): TouchedIds<ViewId>
    queryChanged(viewId: ViewId, aspect?: DataviewQueryAspect): boolean
    layoutChanged(viewId: ViewId): boolean
  }
  factCount(kind: DataviewMutationFactKind): DataviewMutationFactCount | undefined
  facts(): readonly DataviewMutationFact[]
}

export type DataviewMutationChange = MutationChange<DataviewMutationSchema> & DataviewMutationChangeExtension

const changeCache = new WeakMap<MutationChange<DataviewMutationSchema>, DataviewMutationChange>()

const compiled = getCompiledMutationSchema(dataviewMutationSchema)
const root = compiled.root.entries
const recordNodes = root.records
const fieldNodes = root.fields
const viewNodes = root.views

const VIEW_QUERY_ASPECTS: readonly DataviewQueryAspect[] = [
  'search',
  'filter',
  'sort',
  'group',
  'order'
]

const FIELD_SCHEMA_NODE_IDS = new Set<number>([
  fieldNodes.nodeId,
  fieldNodes.entity.entries.name.nodeId,
  fieldNodes.entity.entries.kind.nodeId,
  fieldNodes.entity.entries.displayFullUrl.nodeId,
  fieldNodes.entity.entries.format.nodeId,
  fieldNodes.entity.entries.precision.nodeId,
  fieldNodes.entity.entries.currency.nodeId,
  fieldNodes.entity.entries.useThousandsSeparator.nodeId,
  fieldNodes.entity.entries.defaultOptionId.nodeId,
  fieldNodes.entity.entries.displayDateFormat.nodeId,
  fieldNodes.entity.entries.displayTimeFormat.nodeId,
  fieldNodes.entity.entries.defaultValueKind.nodeId,
  fieldNodes.entity.entries.defaultTimezone.nodeId,
  fieldNodes.entity.entries.multiple.nodeId,
  fieldNodes.entity.entries.accept.nodeId,
  fieldNodes.entity.entries.meta.nodeId,
  fieldNodes.entity.entries.options.nodeId,
  fieldNodes.entity.entries.options.entity.entries.name.nodeId,
  fieldNodes.entity.entries.options.entity.entries.color.nodeId,
  fieldNodes.entity.entries.options.entity.entries.category.nodeId
])

const VIEW_LAYOUT_NODE_IDS = new Set<number>([
  viewNodes.nodeId,
  viewNodes.entity.entries.name.nodeId,
  viewNodes.entity.entries.type.nodeId,
  viewNodes.entity.entries.options.nodeId,
  viewNodes.entity.entries.fields.nodeId
])

const VIEW_QUERY_ASPECT_BY_NODE_ID = new Map<number, DataviewQueryAspect>([
  [viewNodes.entity.entries.search.nodeId, 'search'],
  [viewNodes.entity.entries.filter.nodeId, 'filter'],
  [viewNodes.entity.entries.sort.nodeId, 'sort'],
  [viewNodes.entity.entries.group.nodeId, 'group'],
  [viewNodes.entity.entries.order.nodeId, 'order']
])

const targetId = (write: MutationWrite): string | undefined => write.target?.id

const ownerId = (write: MutationWrite): string | undefined => {
  const scope = write.target?.scope
  return scope && scope.length > 0
    ? scope[scope.length - 1]
    : undefined
}

const hasTouchedIds = <TId extends string>(
  ids: TouchedIds<TId>
): boolean => ids === 'all' || ids.size > 0

const hasTouchedId = <TId extends string>(
  ids: TouchedIds<TId>,
  id: TId
): boolean => ids === 'all' || ids.has(id)

const countTouchedIds = <TId extends string>(
  ids: TouchedIds<TId>
): DataviewMutationFactCount | undefined => ids === 'all'
  ? 'all'
  : ids.size > 0
    ? ids.size
    : undefined

const countSet = <TId extends string>(
  ids: ReadonlySet<TId>
): number | undefined => ids.size > 0
  ? ids.size
  : undefined

const createAspectSet = (
  map: Map<ViewId, Set<DataviewQueryAspect>>,
  viewId: ViewId
): Set<DataviewQueryAspect> => {
  const existing = map.get(viewId)
  if (existing) {
    return existing
  }

  const next = new Set<DataviewQueryAspect>()
  map.set(viewId, next)
  return next
}

const addAllQueryAspects = (
  map: Map<ViewId, Set<DataviewQueryAspect>>,
  viewId: ViewId
): void => {
  const aspects = createAspectSet(map, viewId)
  VIEW_QUERY_ASPECTS.forEach((aspect) => {
    aspects.add(aspect)
  })
}

export const createDataviewChange = (
  query: DataviewQuery,
  base: MutationChange<DataviewMutationSchema>
): DataviewMutationChange => {
  const cached = changeCache.get(base)
  if (cached) {
    return cached
  }

  const reset = base.reset()
  const writes = base.writes()

  const createdRecordIds = new Set<RecordId>()
  const removedRecordIds = new Set<RecordId>()
  const touchedRecordIds = new Set<RecordId>()
  const titleRecordIds = new Set<RecordId>()
  const typeRecordIds = new Set<RecordId>()
  const metaRecordIds = new Set<RecordId>()
  const valueRecordIds = new Set<RecordId>()
  const valueFieldIds = new Set<FieldId>()

  const createdFieldIds = new Set<FieldId>()
  const removedFieldIds = new Set<FieldId>()
  const fieldSchemaIds = new Set<FieldId>()

  const createdViewIds = new Set<ViewId>()
  const removedViewIds = new Set<ViewId>()
  const touchedViewIds = new Set<ViewId>()
  const viewQueryChanges = new Map<ViewId, Set<DataviewQueryAspect>>()
  const viewLayoutChanges = new Set<ViewId>()
  const viewCalcIds = new Set<ViewId>()

  for (const write of writes) {
    const id = targetId(write)

    if (write.nodeId === recordNodes.nodeId && id) {
      const recordId = id as RecordId
      touchedRecordIds.add(recordId)

      if (write.kind === 'entity.create') {
        createdRecordIds.add(recordId)
      } else if (write.kind === 'entity.remove') {
        removedRecordIds.add(recordId)
      } else if (write.kind === 'entity.replace') {
        const nextRecord = write.value as Partial<{
          title: string
          type: string | undefined
          meta: Record<string, unknown> | undefined
          values: Record<string, unknown>
        }>
        if ('title' in nextRecord) {
          titleRecordIds.add(recordId)
          valueFieldIds.add(TITLE_FIELD_ID)
        }
        if ('type' in nextRecord) {
          typeRecordIds.add(recordId)
        }
        if ('meta' in nextRecord) {
          metaRecordIds.add(recordId)
        }
        if (nextRecord.values) {
          valueRecordIds.add(recordId)
          Object.keys(nextRecord.values).forEach((fieldId) => {
            valueFieldIds.add(fieldId as FieldId)
          })
        }
      }
      continue
    }

    if (write.nodeId === recordNodes.entity.entries.title.nodeId && id) {
      touchedRecordIds.add(id as RecordId)
      titleRecordIds.add(id as RecordId)
      valueFieldIds.add(TITLE_FIELD_ID)
      continue
    }

    if (
      (
        write.nodeId === recordNodes.entity.entries.type.nodeId
        || write.nodeId === recordNodes.entity.entries.meta.nodeId
      )
      && id
    ) {
      const recordId = id as RecordId
      touchedRecordIds.add(recordId)
      if (write.nodeId === recordNodes.entity.entries.type.nodeId) {
        typeRecordIds.add(recordId)
      } else {
        metaRecordIds.add(recordId)
      }
      continue
    }

    if (write.nodeId === recordNodes.entity.entries.values.nodeId && id) {
      const recordId = id as RecordId
      touchedRecordIds.add(recordId)
      valueRecordIds.add(recordId)
      if (write.kind === 'dictionary.set' || write.kind === 'dictionary.delete') {
        valueFieldIds.add(write.key as FieldId)
      } else if (write.kind === 'dictionary.replace') {
        Object.keys(write.value).forEach((fieldId) => {
          valueFieldIds.add(fieldId as FieldId)
        })
      }
      continue
    }

    if (FIELD_SCHEMA_NODE_IDS.has(write.nodeId)) {
      const fieldId = (write.nodeId === fieldNodes.nodeId
        ? id
        : ownerId(write) ?? id) as FieldId | undefined
      if (!fieldId) {
        continue
      }

      if (write.nodeId === fieldNodes.nodeId) {
        if (write.kind === 'entity.create') {
          createdFieldIds.add(fieldId)
        } else if (write.kind === 'entity.remove') {
          removedFieldIds.add(fieldId)
        }
      }

      fieldSchemaIds.add(fieldId)
      continue
    }

    if (id && viewNodes.nodeId === write.nodeId) {
      const viewId = id as ViewId
      touchedViewIds.add(viewId)

      if (write.kind === 'entity.create') {
        createdViewIds.add(viewId)
      } else if (write.kind === 'entity.remove') {
        removedViewIds.add(viewId)
      } else if (write.kind === 'entity.replace') {
        const nextView = write.value as Partial<{
          name: string
          type: string
          search: unknown
          filter: unknown
          sort: unknown
          group: unknown
          calc: unknown
          options: unknown
          fields: unknown
          order: unknown
        }>
        if (
          'name' in nextView
          || 'type' in nextView
          || 'options' in nextView
          || 'fields' in nextView
        ) {
          viewLayoutChanges.add(viewId)
        }
        if (
          'search' in nextView
          || 'filter' in nextView
          || 'sort' in nextView
          || 'group' in nextView
          || 'order' in nextView
        ) {
          addAllQueryAspects(viewQueryChanges, viewId)
        }
        if ('calc' in nextView) {
          viewCalcIds.add(viewId)
        }
      }
      continue
    }

    const aspect = VIEW_QUERY_ASPECT_BY_NODE_ID.get(write.nodeId)
    if (
      id
      && (
        aspect !== undefined
        || VIEW_LAYOUT_NODE_IDS.has(write.nodeId)
        || write.nodeId === viewNodes.entity.entries.calc.nodeId
      )
    ) {
      const viewId = id as ViewId
      touchedViewIds.add(viewId)

      if (aspect !== undefined) {
        createAspectSet(viewQueryChanges, viewId).add(aspect)
      }
      if (VIEW_LAYOUT_NODE_IDS.has(write.nodeId)) {
        viewLayoutChanges.add(viewId)
      }
      if (write.nodeId === viewNodes.entity.entries.calc.nodeId) {
        viewCalcIds.add(viewId)
      }
    }
  }

  let touchedFieldsCache: TouchedIds<FieldId> | undefined
  let touchedViewsCache: TouchedIds<ViewId> | undefined
  let factsCache: readonly DataviewMutationFact[] | undefined

  const touchedRecords = (): TouchedIds<RecordId> => reset
    ? 'all'
    : touchedRecordIds

  const valueTouchedIds = (): TouchedIds<FieldId> => reset
    ? 'all'
    : valueFieldIds

  const fieldSchemaTouchedIds = (): TouchedIds<FieldId> => {
    if (reset) {
      return 'all'
    }

    const ids = new Set<FieldId>(fieldSchemaIds)
    createdFieldIds.forEach((fieldId) => {
      ids.add(fieldId)
    })
    removedFieldIds.forEach((fieldId) => {
      ids.add(fieldId)
    })
    return ids
  }

  const touchedFields = (): TouchedIds<FieldId> => {
    if (touchedFieldsCache) {
      return touchedFieldsCache
    }
    const valueIds = valueTouchedIds()
    const schemaIds = fieldSchemaTouchedIds()
    if (valueIds === 'all' || schemaIds === 'all') {
      touchedFieldsCache = 'all'
      return touchedFieldsCache
    }

    touchedFieldsCache = new Set<FieldId>([
      ...valueIds,
      ...schemaIds
    ])
    return touchedFieldsCache
  }

  const touchedViews = (): TouchedIds<ViewId> => {
    if (touchedViewsCache) {
      return touchedViewsCache
    }
    if (reset) {
      touchedViewsCache = 'all'
      return touchedViewsCache
    }

    touchedViewsCache = new Set<ViewId>([
      ...touchedViewIds,
      ...createdViewIds,
      ...removedViewIds
    ])
    return touchedViewsCache
  }

  const fieldSchemaChanged = (fieldId?: FieldId): boolean => {
    if (fieldId === undefined) {
      return hasTouchedIds(fieldSchemaTouchedIds())
    }
    if (fieldId === TITLE_FIELD_ID) {
      return false
    }
    return createdFieldIds.has(fieldId)
      || removedFieldIds.has(fieldId)
      || fieldSchemaIds.has(fieldId)
  }

  const viewQueryChanged = (
    viewId: ViewId,
    aspect?: DataviewQueryAspect
  ): boolean => {
    if (!query.views.has(viewId)) {
      return createdViewIds.has(viewId) || removedViewIds.has(viewId)
    }

    const aspects = viewQueryChanges.get(viewId)
    if (aspect === undefined) {
      return (aspects?.size ?? 0) > 0
    }

    return aspects?.has(aspect) === true
  }

  const viewLayoutChanged = (
    viewId: ViewId
  ): boolean => {
    if (!query.views.has(viewId)) {
      return createdViewIds.has(viewId) || removedViewIds.has(viewId)
    }

    return viewLayoutChanges.has(viewId)
  }

  const recordSetChanged = (): boolean => (
    reset
    || createdRecordIds.size > 0
    || removedRecordIds.size > 0
  )

  const factCount = (
    kind: DataviewMutationFactKind
  ): DataviewMutationFactCount | undefined => {
    switch (kind) {
      case 'record.insert':
        return countSet(createdRecordIds)
      case 'record.title':
        return countSet(titleRecordIds)
      case 'record.type':
        return countSet(typeRecordIds)
      case 'record.meta':
        return countSet(metaRecordIds)
      case 'record.remove':
        return countSet(removedRecordIds)
      case 'record.value':
        return countSet(valueRecordIds)
      case 'field.insert':
        return countSet(createdFieldIds)
      case 'field.remove':
        return countSet(removedFieldIds)
      case 'field.schema':
        return countTouchedIds(fieldSchemaTouchedIds())
      case 'view.insert':
        return countSet(createdViewIds)
      case 'view.change':
        return countTouchedIds(touchedViews())
      case 'view.layout':
        return countSet(viewLayoutChanges)
      case 'view.calc':
        return countSet(viewCalcIds)
      case 'view.remove':
        return countSet(removedViewIds)
      case 'activeView.set':
        return base.activeViewId.changed()
          ? 1
          : undefined
      case 'reset':
        return reset
          ? 1
          : undefined
    }
  }

  const facts = (): readonly DataviewMutationFact[] => {
    if (factsCache) {
      return factsCache
    }

    const next: DataviewMutationFact[] = []
    DATAVIEW_MUTATION_FACT_ORDER.forEach((kind) => {
      const count = factCount(kind)
      if (count === undefined) {
        return
      }

      next.push({
        kind,
        ...(count === 'all'
          ? {}
          : {
              count
            })
      })
    })

    factsCache = next
    return factsCache
  }

  const extension: DataviewMutationChangeExtension = {
  record: {
      setChanged: recordSetChanged,
      touchedIds: touchedRecords,
      values: {
        touchedFieldIds: valueTouchedIds
      }
    },
    field: {
      touchedIds: touchedFields,
      schemaTouchedIds: fieldSchemaTouchedIds,
      schemaChanged: fieldSchemaChanged
    },
    view: {
      touchedIds: touchedViews,
      queryChanged: viewQueryChanged,
      layoutChanged: viewLayoutChanged
    },
    factCount,
    facts
  }

  const change = extendMutationChange(base, extension)
  changeCache.set(base, change)
  return change
}
