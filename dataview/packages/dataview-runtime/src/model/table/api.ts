import type {
  FieldId
} from '@dataview/core/contracts'
import type {
  ViewState
} from '@dataview/engine'
import type {
  DataViewTableModel,
  TableBase,
  TableFooterData,
  TableHeaderData,
  TableSectionData
} from '@dataview/runtime/model/table/types'
import {
  getSorterFieldId
} from '@dataview/runtime/model/queryFields'
import {
  readActiveTypedViewState
} from '@dataview/runtime/model/shared'
import {
  createDerivedStore,
  createKeyedDerivedStore,
  read,
  sameMap,
  type ReadStore
} from '@shared/core'

const sameBase = (
  left: TableBase | null,
  right: TableBase | null
) => left === right || (
  !!left
  && !!right
  && left.viewId === right.viewId
  && left.columns === right.columns
  && left.items === right.items
  && left.sections === right.sections
  && left.grouped === right.grouped
  && left.showVerticalLines === right.showVerticalLines
  && left.wrap === right.wrap
)

const sameHeaderData = (
  left: TableHeaderData,
  right: TableHeaderData
) => left.grouped === right.grouped
  && left.sortDirection === right.sortDirection
  && left.calculationMetric === right.calculationMetric

const sameFooterData = (
  left: TableFooterData | undefined,
  right: TableFooterData | undefined
) => left === right || (
  !!left
  && !!right
  && sameMap(left.summaryByFieldId, right.summaryByFieldId)
)

const sameSectionData = (
  left: TableSectionData | undefined,
  right: TableSectionData | undefined
) => left === right || (
  !!left
  && !!right
  && left.key === right.key
  && left.label === right.label
  && left.collapsed === right.collapsed
  && left.count === right.count
)

export const createTableModel = (input: {
  activeStateStore: ReadStore<ViewState | undefined>
}): DataViewTableModel => {
  const base = createDerivedStore<TableBase | null>({
    get: () => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'table')
      if (!active) {
        return null
      }

      return {
        viewId: active.view.id,
        columns: active.fields.all,
        items: active.items,
        sections: active.sections,
        grouped: Boolean(active.view.group),
        showVerticalLines: active.view.options.table.showVerticalLines,
        wrap: active.view.options.table.wrap
      }
    },
    isEqual: sameBase
  })

  const header = createKeyedDerivedStore<FieldId, TableHeaderData>({
    keyOf: fieldId => fieldId,
    get: fieldId => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'table')
      if (!active) {
        return {
          grouped: false
        }
      }

      return {
        grouped: (
          active.query.group.active === true
          && active.query.group.fieldId === fieldId
        ),
        sortDirection: active.query.sort.rules.find(
          entry => getSorterFieldId(entry.sorter) === fieldId
        )?.sorter.direction,
        calculationMetric: active.view.calc[fieldId]
      }
    },
    isEqual: sameHeaderData
  })

  const footer = createKeyedDerivedStore<string, TableFooterData | undefined>({
    keyOf: scopeId => scopeId,
    get: scopeId => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'table')
      const summary = active?.summaries.get(scopeId)
      return summary
        ? {
            summaryByFieldId: summary.byField
          }
        : undefined
    },
    isEqual: sameFooterData
  })

  const section = createKeyedDerivedStore<string, TableSectionData | undefined>({
    keyOf: key => key,
    get: key => {
      const active = readActiveTypedViewState(read(input.activeStateStore), 'table')
      const value = active?.sections.get(key)
      return value
        ? {
            key: value.key,
            label: value.label,
            collapsed: value.collapsed,
            count: value.items.count
          }
        : undefined
    },
    isEqual: sameSectionData
  })

  return {
    base,
    header,
    footer,
    section
  }
}
