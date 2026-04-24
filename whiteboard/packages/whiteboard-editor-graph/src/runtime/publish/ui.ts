import { createFlags } from '@shared/projection-runtime'
import type { UiChange, UiSnapshot } from '../../contracts/editor'
import type { UiPublishDelta } from '../../contracts/delta'
import type { WorkingState } from '../../contracts/working'
import { patchPublishedFamily } from './family'

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
  const selection = patchPublishedValue({
    previous: input.previous.selection,
    next: input.working.ui.selection,
    changed: input.delta.selection
  })
  const chrome = patchPublishedValue({
    previous: input.previous.chrome,
    next: input.working.ui.chrome,
    changed: input.delta.chrome
  })
  const nodes = patchPublishedFamily({
    previous: input.previous.nodes,
    ids: [...input.working.ui.nodes.keys()],
    delta: input.delta.nodes,
    read: (nodeId) => input.working.ui.nodes.get(nodeId)
  })
  const edges = patchPublishedFamily({
    previous: input.previous.edges,
    ids: [...input.working.ui.edges.keys()],
    delta: input.delta.edges,
    read: (edgeId) => input.working.ui.edges.get(edgeId)
  })

  const value = (
    selection.value === input.previous.selection
    && chrome.value === input.previous.chrome
    && nodes.value === input.previous.nodes
    && edges.value === input.previous.edges
  )
    ? input.previous
    : {
        selection: selection.value,
        chrome: chrome.value,
        nodes: nodes.value,
        edges: edges.value
      }

  return {
    value,
    change: {
      selection: createFlags(selection.changed),
      chrome: createFlags(chrome.changed),
      nodes: nodes.ids,
      edges: edges.ids
    }
  }
}
