import { idDelta } from '@shared/projector/delta'
import {
  createFlags,
  publishEntityFamily,
  type Flags
} from '@shared/projector/publish'
import type { ProjectorPublisher } from '@shared/projector'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  Change,
  GraphChange,
  GraphSnapshot,
  Snapshot,
  UiChange,
  UiSnapshot
} from '../contracts/editor'
import type {
  GraphDelta,
  GraphPublishDelta,
  UiPublishDelta
} from '../contracts/delta'
import type { WorkingState } from '../contracts/working'

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

export const createGraphPublishDelta = (): GraphPublishDelta => ({
  nodes: idDelta.create<NodeId>(),
  edges: idDelta.create<EdgeId>(),
  owners: {
    mindmaps: idDelta.create<MindmapId>(),
    groups: idDelta.create<GroupId>()
  }
})

export const createUiPublishDelta = (): UiPublishDelta => ({
  chrome: false,
  nodes: idDelta.create<NodeId>(),
  edges: idDelta.create<EdgeId>()
})

export const resetGraphPublishDelta = (
  delta: GraphPublishDelta
) => {
  idDelta.reset(delta.nodes)
  idDelta.reset(delta.edges)
  idDelta.reset(delta.owners.mindmaps)
  idDelta.reset(delta.owners.groups)
}

export const resetUiPublishDelta = (
  delta: UiPublishDelta
) => {
  delta.chrome = false
  idDelta.reset(delta.nodes)
  idDelta.reset(delta.edges)
}

export const writeGraphPublishDelta = (input: {
  source: GraphDelta
  target: GraphPublishDelta
}) => {
  resetGraphPublishDelta(input.target)
  idDelta.assign(input.target.nodes, input.source.entities.nodes)
  idDelta.assign(input.target.edges, input.source.entities.edges)
  idDelta.assign(input.target.owners.mindmaps, input.source.entities.mindmaps)
  idDelta.assign(input.target.owners.groups, input.source.entities.groups)
}

export const hasGraphPublishDelta = (
  delta: GraphPublishDelta
): boolean => (
  idDelta.hasAny(delta.nodes)
  || idDelta.hasAny(delta.edges)
  || idDelta.hasAny(delta.owners.mindmaps)
  || idDelta.hasAny(delta.owners.groups)
)

export const hasUiPublishDelta = (
  delta: UiPublishDelta
): boolean => (
  delta.chrome
  || idDelta.hasAny(delta.nodes)
  || idDelta.hasAny(delta.edges)
)

export const readItemsChangedFromGraphDelta = (
  graph: GraphDelta
): boolean => (
  graph.order
  || graph.entities.nodes.added.size > 0
  || graph.entities.nodes.removed.size > 0
  || graph.entities.edges.added.size > 0
  || graph.entities.edges.removed.size > 0
  || graph.entities.mindmaps.added.size > 0
  || graph.entities.mindmaps.removed.size > 0
)

const patchPublishedGraph = (input: {
  previous: GraphSnapshot
  working: WorkingState
  delta: GraphPublishDelta
}): {
  value: GraphSnapshot
  change: GraphChange
} => {
  const nodes = publishEntityFamily({
    previous: input.previous.nodes,
    ids: [...input.working.graph.nodes.keys()],
    change: input.delta.nodes,
    read: (nodeId) => input.working.graph.nodes.get(nodeId)
  })
  const edges = publishEntityFamily({
    previous: input.previous.edges,
    ids: [...input.working.graph.edges.keys()],
    change: input.delta.edges,
    read: (edgeId) => input.working.graph.edges.get(edgeId)
  })
  const mindmaps = publishEntityFamily({
    previous: input.previous.owners.mindmaps,
    ids: [...input.working.graph.owners.mindmaps.keys()],
    change: input.delta.owners.mindmaps,
    read: (mindmapId) => input.working.graph.owners.mindmaps.get(mindmapId)
  })
  const groups = publishEntityFamily({
    previous: input.previous.owners.groups,
    ids: [...input.working.graph.owners.groups.keys()],
    change: input.delta.owners.groups,
    read: (groupId) => input.working.graph.owners.groups.get(groupId)
  })

  const owners = (
    mindmaps.value === input.previous.owners.mindmaps
    && groups.value === input.previous.owners.groups
  )
    ? input.previous.owners
    : {
        mindmaps: mindmaps.value,
        groups: groups.value
      }

  const value = (
    nodes.value === input.previous.nodes
    && edges.value === input.previous.edges
    && owners === input.previous.owners
  )
    ? input.previous
    : {
        nodes: nodes.value,
        edges: edges.value,
        owners
      }

  return {
    value,
    change: {
      nodes: nodes.change,
      edges: edges.change,
      owners: {
        mindmaps: mindmaps.change,
        groups: groups.change
      }
    }
  }
}

const patchPublishedUi = (input: {
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

const patchPublishedItems = (input: {
  previous: readonly Snapshot['items'][number][]
  working: WorkingState
  changed: boolean
}): {
  value: readonly Snapshot['items'][number][]
  change: Flags
} => {
  if (!input.changed) {
    return {
      value: input.previous,
      change: createFlags(false)
    }
  }

  return {
    value: input.working.items,
    change: createFlags(true)
  }
}

const EMPTY_GRAPH_PUBLISH_DELTA = createGraphPublishDelta()
const EMPTY_UI_PUBLISH_DELTA = createUiPublishDelta()

export const editorGraphPublisher: ProjectorPublisher<
  WorkingState,
  Snapshot,
  Change
> = {
  publish: ({ revision, previous, working }) => {
    const graph = patchPublishedGraph({
      previous: previous.graph,
      working,
      delta: working.publish.graph.revision === revision
        ? working.publish.graph.delta
        : EMPTY_GRAPH_PUBLISH_DELTA
    })
    const ui = patchPublishedUi({
      previous: previous.ui,
      working,
      delta: working.publish.ui.revision === revision
        ? working.publish.ui.delta
        : EMPTY_UI_PUBLISH_DELTA
    })
    const items = patchPublishedItems({
      previous: previous.items,
      working,
      changed: working.delta.graph.revision === revision
        && readItemsChangedFromGraphDelta(working.delta.graph)
    })

    return {
      snapshot: {
        revision,
        documentRevision: working.revision.document,
        graph: graph.value,
        items: items.value,
        ui: ui.value
      },
      change: {
        graph: graph.change,
        items: items.change,
        ui: ui.change
      }
    }
  }
}
