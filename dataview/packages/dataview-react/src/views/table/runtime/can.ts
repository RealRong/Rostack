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
  hover: store.projected({
    source: state,
    select: current => current.canHover,
    isEqual: Object.is
  }),
  rowDrag: store.projected({
    source: state,
    select: current => current.canRowDrag,
    isEqual: Object.is
  }),
  columnResize: store.projected({
    source: state,
    select: current => current.canColumnResize,
    isEqual: Object.is
  }),
  fill: store.projected({
    source: state,
    select: current => current.showFillHandle,
    isEqual: Object.is
  })
})
