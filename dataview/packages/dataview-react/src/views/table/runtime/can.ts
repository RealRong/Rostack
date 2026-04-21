import { store } from '@shared/core'
import type { Capabilities } from '@dataview/react/views/table/capabilities'

export interface TableCanRuntime {
  state: store.ReadStore<Capabilities>
  hover: store.ReadStore<boolean>
  rowDrag: store.ReadStore<boolean>
  columnResize: store.ReadStore<boolean>
  fill: store.ReadStore<boolean>
}

export const createTableCanRuntime = (
  state: store.ReadStore<Capabilities>
): TableCanRuntime => ({
  state,
  hover: store.createProjectedStore({
    source: state,
    select: current => current.canHover,
    isEqual: Object.is
  }),
  rowDrag: store.createProjectedStore({
    source: state,
    select: current => current.canRowDrag,
    isEqual: Object.is
  }),
  columnResize: store.createProjectedStore({
    source: state,
    select: current => current.canColumnResize,
    isEqual: Object.is
  }),
  fill: store.createProjectedStore({
    source: state,
    select: current => current.showFillHandle,
    isEqual: Object.is
  })
})
