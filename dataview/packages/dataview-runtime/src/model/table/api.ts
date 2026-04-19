import type {
  FieldId
} from '@dataview/core/contracts'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  read,
  sameMap
} from '@shared/core'
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
  && sameMap(left.byField, right.byField)
)

export const createTableModel = (input: {
  source: DataViewSource
}): DataViewTableModel => {
  const body = createDerivedStore<TableBody | null>({
    get: () => {
      if (read(input.source.active.view.type) !== 'table') {
        return null
      }

      const viewId = read(input.source.active.view.id)
      if (!viewId) {
        return null
      }

      return {
        viewId,
        empty: read(input.source.active.items.ids).length === 0,
        grouped: read(input.source.active.query.grouped),
        wrap: read(input.source.active.table.wrap),
        showVerticalLines: read(input.source.active.table.showVerticalLines),
        columnIds: read(input.source.active.fields.all.ids),
        sectionKeys: read(input.source.active.sections.keys)
      }
    },
    isEqual: sameBody
  })

  const column = createKeyedDerivedStore<FieldId, TableColumn | undefined>({
    get: fieldId => {
      if (read(input.source.active.view.type) !== 'table') {
        return undefined
      }

      return {
        field: read(input.source.active.fields.all, fieldId),
        grouped: read(input.source.active.query.groupFieldId) === fieldId,
        sortDir: read(input.source.active.query.sortDir, fieldId),
        calc: read(input.source.active.table.calc, fieldId)
      }
    },
    isEqual: sameColumn
  })

  const section = createKeyedDerivedStore<string, TableSection | undefined>({
    get: key => {
      if (read(input.source.active.view.type) !== 'table') {
        return undefined
      }

      const value = read(input.source.active.sections, key)
      return value
        ? {
            key: value.key,
            label: value.label,
            collapsed: value.collapsed,
            count: value.items.count
          }
        : undefined
    },
    isEqual: sameSection
  })

  const summary = createKeyedDerivedStore<string, TableSummary | undefined>({
    get: key => {
      if (read(input.source.active.view.type) !== 'table') {
        return undefined
      }

      const value = read(input.source.active.sections.summary, key)
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
