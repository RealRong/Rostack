import { store } from '@shared/core'
import type {
  SelectionAffordance,
  SelectionSummary
} from '@whiteboard/core/selection'
import type { EdgeId, NodeId } from '@whiteboard/core/types'
import type { SelectionModelRead } from '@whiteboard/editor/query/selection/model'
import type { SelectionMembers } from '@whiteboard/editor/types/selectionPresentation'

export type SelectionRead = {
  members: store.ReadStore<SelectionMembers>
  summary: store.ReadStore<SelectionSummary>
  affordance: store.ReadStore<SelectionAffordance>
  node: {
    selected: store.KeyedReadStore<NodeId, boolean>
  }
  edge: {
    selected: store.KeyedReadStore<EdgeId, boolean>
  }
}

export const createSelectionRead = ({
  model,
  runtime
}: {
  model: SelectionModelRead
  runtime: {
    node: {
      selected: store.KeyedReadStore<NodeId, boolean>
    }
    edge: {
      selected: store.KeyedReadStore<EdgeId, boolean>
    }
  }
}): SelectionRead => {
  const members = store.createDerivedStore<SelectionMembers>({
    get: () => store.read(model).members,
    isEqual: (left, right) => left === right || (
      left.key === right.key
      && left.target === right.target
      && left.nodes === right.nodes
      && left.edges === right.edges
      && left.primaryNode === right.primaryNode
      && left.primaryEdge === right.primaryEdge
    )
  })

  const summary = store.createDerivedStore<SelectionSummary>({
    get: () => store.read(model).summary,
    isEqual: (left, right) => left === right
  })

  const affordance = store.createDerivedStore<SelectionAffordance>({
    get: () => store.read(model).affordance,
    isEqual: (left, right) => left === right
  })

  return {
    members,
    summary,
    affordance,
    node: {
      selected: runtime.node.selected
    },
    edge: {
      selected: runtime.edge.selected
    }
  }
}
