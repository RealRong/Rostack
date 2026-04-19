import {
  createProjectedKeyedStore,
  type KeyedReadStore,
  type ReadStore
} from '@shared/core'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { EdgeId, NodeId } from '@whiteboard/core/types'

export type SelectionRuntimeRead = {
  node: {
    selected: KeyedReadStore<NodeId, boolean>
  }
  edge: {
    selected: KeyedReadStore<EdgeId, boolean>
  }
}

const EMPTY_SELECTED_NODES = new Map<NodeId, boolean>()
const EMPTY_SELECTED_EDGES = new Map<EdgeId, boolean>()

export const createSelectionRuntimeRead = (
  source: ReadStore<SelectionTarget>
): SelectionRuntimeRead => ({
  node: {
    selected: createProjectedKeyedStore({
      source,
      select: (target) => (
        target.nodeIds.length > 0
          ? new Map(target.nodeIds.map((nodeId) => [nodeId, true] as const))
          : EMPTY_SELECTED_NODES
      ),
      emptyValue: false
    })
  },
  edge: {
    selected: createProjectedKeyedStore({
      source,
      select: (target) => (
        target.edgeIds.length > 0
          ? new Map(target.edgeIds.map((edgeId) => [edgeId, true] as const))
          : EMPTY_SELECTED_EDGES
      ),
      emptyValue: false
    })
  }
})
