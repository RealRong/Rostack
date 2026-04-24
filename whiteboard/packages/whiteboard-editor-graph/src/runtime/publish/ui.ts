import { createFlags } from '@shared/projection-runtime'
import { publishEntityFamily } from '@shared/projection-runtime'
import type { UiChange, UiSnapshot } from '../../contracts/editor'
import type { UiPublishDelta } from '../../contracts/delta'
import type { WorkingState } from '../../contracts/working'

const patchPublishedValue = <TValue>(input: {
  previous: TValue
  next: TValue
  changed: boolean
}) => input.changed
  ? {
      value: input.next,
      changed: true
    }
  : {
      value: input.previous,
      changed: false
    }

export const patchPublishedUi = (input: {
  previous: UiSnapshot
  working: WorkingState
  delta: UiPublishDelta
}): {
  value: UiSnapshot
  change: UiChange
} => {
  const chrome = patchPublishedValue({
    previous: input.previous.chrome,
    next: input.working.ui.chrome,
    changed: input.delta.chrome
  })
  const nodes = publishEntityFamily({
    previous: input.previous.nodes,
    ids: [...input.working.ui.nodes.keys()],
    change: input.delta.nodes,
    read: (nodeId) => input.working.ui.nodes.get(nodeId)
  })
  const edges = publishEntityFamily({
    previous: input.previous.edges,
    ids: [...input.working.ui.edges.keys()],
    change: input.delta.edges,
    read: (edgeId) => input.working.ui.edges.get(edgeId)
  })

  const value = (
    chrome.value === input.previous.chrome
    && nodes.value === input.previous.nodes
    && edges.value === input.previous.edges
  )
    ? input.previous
    : {
        chrome: chrome.value,
        nodes: nodes.value,
        edges: edges.value
      }

  return {
    value,
    change: {
      chrome: createFlags(chrome.changed),
      nodes: nodes.change,
      edges: edges.change
    }
  }
}
