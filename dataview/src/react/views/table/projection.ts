import type { Engine } from '@dataview/engine'
import {
  createDerivedStore,
  type ReadStore
} from '@shared/core'
import type {
  TableCurrentView
} from './currentView'
import {
  sameTableCurrentView
} from './currentView'

export type TableViewProjection = TableCurrentView

export const createTableViewStore = (input: {
  engine: Engine
}): ReadStore<TableViewProjection | undefined> => createDerivedStore<TableViewProjection | undefined>({
  get: read => {
    const state = read(input.engine.active.state)
    const extra = read(input.engine.active.table.state)
    if (
      !state
      || state.view.type !== 'table'
      || !extra
    ) {
      return undefined
    }

    return {
      view: state.view as TableViewProjection['view'],
      group: state.group,
      sort: state.sort,
      appearances: state.appearances,
      sections: state.sections,
      fields: state.fields,
      calculationsBySection: state.calculations,
      groupField: extra.groupField,
      customFields: extra.customFields,
      visibleFieldIds: extra.visibleFieldIds,
      showVerticalLines: extra.showVerticalLines
    }
  },
  isEqual: sameTableCurrentView
})
