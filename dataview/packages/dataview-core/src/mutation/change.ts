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
  type MutationChange,
  type MutationWrite,
} from '@shared/mutation'
import {
  type DataviewMutationSchema,
} from './schema'
import type {
  DataviewQuery
} from './query'
import {
  dataviewChangeModel
} from './changeModel'

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
  const recordNodes = dataviewChangeModel.record
  const fieldNodes = dataviewChangeModel.field
  const viewNodes = dataviewChangeModel.view

  for (const write of writes) {
    const id = targetId(write)

    if (write.nodeId === recordNodes.entity && id) {
      const recordId = id as RecordId
      touchedRecordIds.add(recordId)

      if (write.kind === 'entity.create') {
        createdRecordIds.add(recordId)
      } else if (write.kind === 'entity.remove') {
        removedRecordIds.add(recordId)
      }
      continue
    }

    if (write.nodeId === recordNodes.title && id) {
      touchedRecordIds.add(id as RecordId)
      titleRecordIds.add(id as RecordId)
      valueFieldIds.add(TITLE_FIELD_ID)
      continue
    }

    if (
      (
        write.nodeId === recordNodes.type
        || write.nodeId === recordNodes.meta
      )
      && id
    ) {
      const recordId = id as RecordId
      touchedRecordIds.add(recordId)
      if (write.nodeId === recordNodes.type) {
        typeRecordIds.add(recordId)
      } else {
        metaRecordIds.add(recordId)
      }
      continue
    }

    if (write.nodeId === recordNodes.values && id) {
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

    if (fieldNodes.schema.has(write.nodeId)) {
      const fieldId = (write.nodeId === fieldNodes.entity
        ? id
        : ownerId(write) ?? id) as FieldId | undefined
      if (!fieldId) {
        continue
      }

      if (write.nodeId === fieldNodes.entity) {
        if (write.kind === 'entity.create') {
          createdFieldIds.add(fieldId)
        } else if (write.kind === 'entity.remove') {
          removedFieldIds.add(fieldId)
        }
      }

      fieldSchemaIds.add(fieldId)
      continue
    }

    if (id && viewNodes.entity === write.nodeId) {
      const viewId = id as ViewId
      touchedViewIds.add(viewId)

      if (write.kind === 'entity.create') {
        createdViewIds.add(viewId)
      } else if (write.kind === 'entity.remove') {
        removedViewIds.add(viewId)
      }
      continue
    }

    const aspect = viewNodes.queryAspectByNodeId.get(write.nodeId)
    if (
      id
      && (
        aspect !== undefined
        || viewNodes.layout.has(write.nodeId)
        || write.nodeId === viewNodes.calc
      )
    ) {
      const viewId = id as ViewId
      touchedViewIds.add(viewId)

      if (aspect !== undefined) {
        createAspectSet(viewQueryChanges, viewId).add(aspect)
      }
      if (viewNodes.layout.has(write.nodeId)) {
        viewLayoutChanges.add(viewId)
      }
      if (write.nodeId === viewNodes.calc) {
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
