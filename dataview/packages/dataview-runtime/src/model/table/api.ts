import type {
  FieldId
} from '@dataview/core/contracts'
import { equal, store } from '@shared/core'
import {
  queryRead
} from '@dataview/engine'
import type {
  DataViewSource
} from '@dataview/runtime/dataview/types'
import type {
  DataViewTableModel,
  TableBody,
  TableColumn,
  TableSection,
  TableSummary
} from '@dataview/runtime/model/table/types'

const sameBody = (
  left: TableBody | null,
  right: TableBody | null
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.empty === right.empty
  && left.grouped === right.grouped
  && left.wrap === right.wrap
  && left.showVerticalLines === right.showVerticalLines
  && left.columnIds === right.columnIds
  && left.sectionKeys === right.sectionKeys
)

const sameColumn = (
  left: TableColumn | undefined,
  right: TableColumn | undefined
) => left === right || (
  !!left
  && !!right
  && left.field === right.field
  && left.grouped === right.grouped
  && left.sortDir === right.sortDir
  && left.calc === right.calc
)

const sameSection = (
  left: TableSection | undefined,
  right: TableSection | undefined
) => left === right || (
  !!left
  && !!right
  && left.key === right.key
  && left.label === right.label
  && left.collapsed === right.collapsed
  && left.count === right.count
)

const sameSummary = (
  left: TableSummary | undefined,
  right: TableSummary | undefined
) => left === right || (
  !!left
  && !!right
  && equal.sameMap(left.byField, right.byField)
)

export const createTableModel = (input: {
  source: DataViewSource
}): DataViewTableModel => {
  const body = store.createDerivedStore<TableBody | null>({
    get: () => {
      if (store.read(input.source.active.view.type) !== 'table') {
        return null
      }

      const viewId = store.read(input.source.active.view.id)
      if (!viewId) {
        return null
      }

      return {
        viewId,
        empty: store.read(input.source.active.items.ids).length === 0,
        grouped: queryRead.grouped(store.read(input.source.active.meta.query)),
        wrap: store.read(input.source.active.meta.table).wrap,
        showVerticalLines: store.read(input.source.active.meta.table).showVerticalLines,
        columnIds: store.read(input.source.active.fields.all.ids),
        sectionKeys: store.read(input.source.active.sections.keys)
      }
    },
    isEqual: sameBody
  })

  const column = store.createKeyedDerivedStore<FieldId, TableColumn | undefined>({
    get: fieldId => {
      if (store.read(input.source.active.view.type) !== 'table') {
        return undefined
      }

      const query = store.read(input.source.active.meta.query)
      const table = store.read(input.source.active.meta.table)
      return {
        field: store.read(input.source.active.fields.all, fieldId),
        grouped: queryRead.groupFieldId(query) === fieldId,
        sortDir: queryRead.sortDir(query, fieldId),
        calc: table.calc.get(fieldId)
      }
    },
    isEqual: sameColumn
  })

  const section = store.createKeyedDerivedStore<string, TableSection | undefined>({
    get: key => {
      if (store.read(input.source.active.view.type) !== 'table') {
        return undefined
      }

      const value = store.read(input.source.active.sections, key)
      return value
        ? {
            key: value.key,
            label: value.label,
            collapsed: value.collapsed,
            count: value.itemIds.length
          }
        : undefined
    },
    isEqual: sameSection
  })

  const summary = store.createKeyedDerivedStore<string, TableSummary | undefined>({
    get: key => {
      if (store.read(input.source.active.view.type) !== 'table') {
        return undefined
      }

      const value = store.read(input.source.active.summaries, key)
      return value
        ? {
            byField: value.byField
          }
        : undefined
    },
    isEqual: sameSummary
  })

  return {
    body,
    column,
    section,
    summary
  }
}
