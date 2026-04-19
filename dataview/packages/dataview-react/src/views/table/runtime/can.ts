import {
  createProjectedStore,
  type ReadStore
} from '@shared/core'
import type { Capabilities } from '@dataview/react/views/table/capabilities'

export interface TableCanRuntime {
  state: ReadStore<Capabilities>
  hover: ReadStore<boolean>
  rowDrag: ReadStore<boolean>
  columnResize: ReadStore<boolean>
  fill: ReadStore<boolean>
}

export const createTableCanRuntime = (
  state: ReadStore<Capabilities>
): TableCanRuntime => ({
  state,
  hover: createProjectedStore({
    source: state,
    select: current => current.canHover,
    isEqual: Object.is
  }),
  rowDrag: createProjectedStore({
    source: state,
    select: current => current.canRowDrag,
    isEqual: Object.is
  }),
  columnResize: createProjectedStore({
    source: state,
    select: current => current.canColumnResize,
    isEqual: Object.is
  }),
  fill: createProjectedStore({
    source: state,
    select: current => current.showFillHandle,
    isEqual: Object.is
  })
})
