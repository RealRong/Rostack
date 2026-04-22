import { store } from '@shared/core'
import type {
  ActiveViewQuery,
  FieldList,
  ItemId,
  ItemList,
  SectionKey,
  SectionList
} from '@dataview/engine'
import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CalculationMetric,
  Field,
  FieldId,
  SortDirection,
  View,
  ViewId
} from '@dataview/core/contracts'
import type { ActiveSource } from '@dataview/runtime/source'

export interface TableGrid {
  items: ItemList
  fields: FieldList
  sections: SectionList
}

export interface TableQueryState {
  search: ActiveViewQuery['search']
  filters: ActiveViewQuery['filters']
  group?: ActiveViewQuery['group']
  sort: ActiveViewQuery['sort']
}

export interface TableViewState {
  id: ViewId
  query: TableQueryState
  displayFieldIds: readonly FieldId[]
  widths: ReadonlyMap<FieldId, number>
  wrap: boolean
  showVerticalLines: boolean
  calcByField: ReadonlyMap<FieldId, CalculationMetric | undefined>
}

export interface TableColumnState {
  field: Field
  grouped: boolean
  sortDir?: SortDirection
  calc?: CalculationMetric
}

export interface TableModel {
  grid: store.ReadStore<TableGrid | undefined>
  view: store.ReadStore<TableViewState | undefined>
  column: store.KeyedReadStore<FieldId, TableColumnState | undefined>
  summary: store.KeyedReadStore<SectionKey, CalculationCollection | undefined>
}

const readTableView = (
  active: ActiveSource
): View | undefined => {
  const view = store.read(active.view.current)
  return view?.type === 'table'
    ? view
    : undefined
}

const buildWidths = (
  widths: View['options']['table']['widths']
): ReadonlyMap<FieldId, number> => new Map(
  Object.entries(widths) as [FieldId, number][]
)

const sameColumn = (
  left: TableColumnState | undefined,
  right: TableColumnState | undefined
) => left === right || (
  !!left
  && !!right
  && left.field === right.field
  && left.grouped === right.grouped
  && left.sortDir === right.sortDir
  && left.calc === right.calc
)

const readSortDir = (
  query: TableQueryState,
  fieldId: FieldId
): SortDirection | undefined => query.sort.rules.find(
  rule => rule.sorter.field === fieldId
)?.sorter.direction

export const createTableModel = (
  active: ActiveSource
): TableModel => {
  let previousGrid: TableGrid | undefined
  let previousView: TableViewState | undefined
  let previousWidthSource: View['options']['table']['widths'] | undefined

  const grid = store.createDerivedStore<TableGrid | undefined>({
    get: () => {
      if (!readTableView(active)) {
        previousGrid = undefined
        return undefined
      }

      const next = {
        items: store.read(active.items.list),
        fields: store.read(active.fields.list),
        sections: store.read(active.sections.list)
      } satisfies TableGrid

      if (
        previousGrid
        && previousGrid.items === next.items
        && previousGrid.fields === next.fields
        && previousGrid.sections === next.sections
      ) {
        return previousGrid
      }

      previousGrid = next
      return next
    },
    isEqual: Object.is
  })

  const view = store.createDerivedStore<TableViewState | undefined>({
    get: () => {
      const tableView = readTableView(active)
      if (!tableView) {
        previousView = undefined
        previousWidthSource = undefined
        return undefined
      }

      const query = store.read(active.query)
      const table = store.read(active.table)
      const widthSource = tableView.options.table.widths
      const widths = previousWidthSource === widthSource && previousView
        ? previousView.widths
        : buildWidths(widthSource)
      const next = {
        id: tableView.id,
        query: {
          search: query.search,
          filters: query.filters,
          group: query.group,
          sort: query.sort
        },
        displayFieldIds: tableView.display.fields,
        widths,
        wrap: table.wrap,
        showVerticalLines: table.showVerticalLines,
        calcByField: table.calc
      } satisfies TableViewState

      if (
        previousView
        && previousView.id === next.id
        && previousView.query.search === next.query.search
        && previousView.query.filters === next.query.filters
        && previousView.query.group === next.query.group
        && previousView.query.sort === next.query.sort
        && previousView.displayFieldIds === next.displayFieldIds
        && previousView.widths === next.widths
        && previousView.wrap === next.wrap
        && previousView.showVerticalLines === next.showVerticalLines
        && previousView.calcByField === next.calcByField
      ) {
        return previousView
      }

      previousWidthSource = widthSource
      previousView = next
      return next
    },
    isEqual: Object.is
  })

  const column = store.createKeyedDerivedStore<FieldId, TableColumnState | undefined>({
    get: fieldId => {
      if (!readTableView(active)) {
        return undefined
      }

      const field = store.read(active.fields.all, fieldId)
      if (!field) {
        return undefined
      }

      const query = store.read(active.query)
      const table = store.read(active.table)

      return {
        field,
        grouped: query.group?.fieldId === fieldId,
        sortDir: readSortDir(query, fieldId),
        calc: table.calc.get(fieldId)
      }
    },
    isEqual: sameColumn
  })

  const summary = store.createKeyedDerivedStore<SectionKey, CalculationCollection | undefined>({
    get: sectionKey => readTableView(active)
      ? store.read(active.summaries, sectionKey)
      : undefined,
    isEqual: Object.is
  })

  return {
    grid,
    view,
    column,
    summary
  }
}
