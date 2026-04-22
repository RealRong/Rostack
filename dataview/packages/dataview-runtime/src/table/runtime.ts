import { collection, store } from '@shared/core'
import type {
  FieldList,
  ItemList,
  ItemId,
  RecordId,
  Section,
  SectionKey,
  SectionList
} from '@dataview/engine'
import type {
  ActiveViewQuery,
  ActiveViewTable
} from '@dataview/engine/contracts/view'
import type {
  View
} from '@dataview/core/contracts'
import type {
  ActiveSource
} from '@dataview/runtime/source'

export interface TableGridDomain {
  items: ItemList
  fields: FieldList
}

export interface TableViewContext {
  view: View
  query: ActiveViewQuery
  table: ActiveViewTable
}

export interface TableSectionContext {
  sections: SectionList
}

export interface TableRecordAccess {
  recordId: (itemId: ItemId) => RecordId | undefined
  sectionKey: (itemId: ItemId) => SectionKey | undefined
}

export interface TableRuntime {
  grid: store.ReadStore<TableGridDomain | undefined>
  view: store.ReadStore<TableViewContext | undefined>
  sections: store.ReadStore<TableSectionContext | undefined>
  record: TableRecordAccess
}

const buildGridItems = (input: {
  previous?: ItemList
  source: ActiveSource['items']
}): ItemList => {
  const ids = store.read(input.source.ids)

  return input.previous?.ids === ids
    ? input.previous
    : {
        ids,
        count: ids.length,
        order: collection.createOrderedAccess(ids),
        read: {
          record: itemId => input.source.read.record.get(itemId),
          section: itemId => input.source.read.section.get(itemId),
          placement: itemId => input.source.read.placement.get(itemId)
        }
      }
}

const buildFieldList = (input: {
  previous?: FieldList
  source: ActiveSource['fields']
}): FieldList => {
  const ids = store.read(input.source.all.ids)
  const customIds = store.read(input.source.custom.ids)
  const canReuse = Boolean(
    input.previous
    && input.previous.ids === ids
    && ids.every(fieldId => input.previous!.get(fieldId) === store.read(input.source.all, fieldId))
    && input.previous.custom.length === customIds.length
    && customIds.every((fieldId, index) => (
      input.previous!.custom[index] === store.read(input.source.custom, fieldId)
    ))
  )
  if (canReuse) {
    return input.previous as FieldList
  }

  const all = ids.flatMap(fieldId => {
    const field = store.read(input.source.all, fieldId)
    return field
      ? [field]
      : []
  })
  const byId = new Map(all.map(field => [field.id, field] as const))
  const custom = customIds.flatMap(fieldId => {
    const field = store.read(input.source.custom, fieldId)
    return field
      ? [field]
      : []
  })

  return {
    ...collection.createOrderedKeyedCollection({
      ids,
      all,
      get: fieldId => byId.get(fieldId)
    }),
    custom
  }
}

const buildSections = (input: {
  previous?: SectionList
  source: ActiveSource['sections']
}): SectionList => {
  const ids = store.read(input.source.keys)
  const canReuse = Boolean(
    input.previous
    && input.previous.ids === ids
    && ids.every(sectionKey => input.previous!.get(sectionKey) === store.read(input.source, sectionKey))
  )
  if (canReuse) {
    return input.previous as SectionList
  }

  const all = ids.flatMap(sectionKey => {
    const section = store.read(input.source, sectionKey)
    return section
      ? [section]
      : []
  })
  const byKey = new Map<SectionKey, Section>(all.map(section => [section.key, section] as const))

  return collection.createOrderedKeyedCollection({
    ids,
    all,
    get: sectionKey => byKey.get(sectionKey)
  })
}

const readTableView = (
  active: ActiveSource
): View | undefined => {
  const view = store.read(active.view.current)
  return view?.type === 'table'
    ? view
    : undefined
}

export const createTableRuntime = (
  active: ActiveSource
): TableRuntime => {
  let previousGrid: TableGridDomain | undefined
  let previousView: TableViewContext | undefined
  let previousSections: TableSectionContext | undefined

  const grid = store.createDerivedStore<TableGridDomain | undefined>({
    get: () => {
      if (!readTableView(active)) {
        previousGrid = undefined
        return undefined
      }

      const next = {
        items: buildGridItems({
          previous: previousGrid?.items,
          source: active.items
        }),
        fields: buildFieldList({
          previous: previousGrid?.fields,
          source: active.fields
        })
      } satisfies TableGridDomain

      if (
        previousGrid
        && previousGrid.items === next.items
        && previousGrid.fields === next.fields
      ) {
        return previousGrid
      }

      previousGrid = next
      return next
    },
    isEqual: Object.is
  })

  const view = store.createDerivedStore<TableViewContext | undefined>({
    get: () => {
      const tableView = readTableView(active)
      if (!tableView) {
        previousView = undefined
        return undefined
      }

      const next = {
        view: tableView,
        query: store.read(active.meta.query),
        table: store.read(active.meta.table)
      } satisfies TableViewContext

      if (
        previousView
        && previousView.view === next.view
        && previousView.query === next.query
        && previousView.table === next.table
      ) {
        return previousView
      }

      previousView = next
      return next
    },
    isEqual: Object.is
  })

  const sections = store.createDerivedStore<TableSectionContext | undefined>({
    get: () => {
      if (!readTableView(active)) {
        previousSections = undefined
        return undefined
      }

      const next = {
        sections: buildSections({
          previous: previousSections?.sections,
          source: active.sections
        })
      } satisfies TableSectionContext

      if (
        previousSections
        && previousSections.sections === next.sections
      ) {
        return previousSections
      }

      previousSections = next
      return next
    },
    isEqual: Object.is
  })

  return {
    grid,
    view,
    sections,
    record: {
      recordId: itemId => active.items.read.record.get(itemId),
      sectionKey: itemId => active.items.read.section.get(itemId)
    }
  }
}
