import type {
  ItemId,
  SectionId
} from '@dataview/engine'
import { equal } from '@shared/core'
import type {
  TableLayoutState
} from '@dataview/react/views/table/virtual/layoutState'
import {
  tableBlockKey
} from '@dataview/react/views/table/virtual/blockId'

export interface TableMeasurementPlan {
  ids: readonly string[]
}

export const EMPTY_TABLE_MEASUREMENT_PLAN: TableMeasurementPlan = {
  ids: []
}

const appendRowMeasurementIds = (
  ids: string[],
  itemIds: readonly ItemId[]
) => {
  for (let index = 0; index < itemIds.length; index += 1) {
    ids.push(tableBlockKey({
      kind: 'row',
      rowId: itemIds[index]!
    }))
  }
}

const appendSectionMeasurementIds = (input: {
  ids: string[]
  grouped: boolean
  sectionId: SectionId
  collapsed: boolean
  itemIds: readonly ItemId[]
}) => {
  if (input.grouped) {
    input.ids.push(tableBlockKey({
      kind: 'section-header',
      sectionId: input.sectionId
    }))
    if (input.collapsed) {
      return
    }
  }

  input.ids.push(tableBlockKey({
    kind: 'column-header',
    sectionId: input.sectionId
  }))
  appendRowMeasurementIds(input.ids, input.itemIds)
  input.ids.push(tableBlockKey({
    kind: 'create-record',
    sectionId: input.sectionId
  }))
  input.ids.push(tableBlockKey({
    kind: 'column-footer',
    sectionId: input.sectionId
  }))
}

export const createTableMeasurementPlan = (input: {
  state: TableLayoutState
}): TableMeasurementPlan => {
  const ids: string[] = []

  for (let index = 0; index < input.state.sections.length; index += 1) {
    const section = input.state.sections[index]!
    appendSectionMeasurementIds({
      ids,
      grouped: input.state.grouped,
      sectionId: section.key,
      collapsed: section.collapsed,
      itemIds: section.itemIds
    })
  }

  return {
    ids
  }
}

export const sameTableMeasurementPlan = (
  left: TableMeasurementPlan,
  right: TableMeasurementPlan
) => left === right
  || equal.sameOrder(left.ids, right.ids)
