import { idDelta } from '@shared/delta'
import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import {
  uiChange
} from '../../contracts/delta'
import type {
  EdgeUiView,
  Input,
  NodeUiView
} from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import {
  buildChromeView,
  buildEdgeUiView,
  buildNodeUiView,
  isChromeViewEqual,
  isEdgeUiViewEqual,
  isNodeUiViewEqual
} from './equality'

const appendIds = <TId extends string>(
  target: Set<TId>,
  ids: Iterable<TId>
) => {
  for (const id of ids) {
    target.add(id)
  }
}

const appendMindmapNodeIds = (input: {
  target: Set<NodeId>
  mindmapIds: Iterable<MindmapId>
  working: WorkingState
}) => {
  for (const mindmapId of input.mindmapIds) {
    input.working.graph.owners.mindmaps
      .get(mindmapId)
      ?.structure.nodeIds
      .forEach((nodeId) => {
        input.target.add(nodeId)
      })
  }
}

const readHoveredNodeId = (
  hover: WorkingState['ui']['chrome']['hover'] | Input['runtime']['interaction']['hover']
): NodeId | undefined => hover.kind === 'node'
  ? hover.nodeId
  : undefined

const readHoveredEdgeId = (
  hover: WorkingState['ui']['chrome']['hover'] | Input['runtime']['interaction']['hover']
): EdgeId | undefined => hover.kind === 'edge'
  ? hover.edgeId
  : undefined

const readEditingEdgeId = (
  edit: Input['runtime']['session']['edit'] | WorkingState['ui']['chrome']['edit']
): EdgeId | undefined => edit?.kind === 'edge-label'
  ? edit.edgeId
  : undefined

const readEditingNodeId = (
  edit: Input['runtime']['session']['edit'] | WorkingState['ui']['chrome']['edit']
): NodeId | undefined => edit?.kind === 'node'
  ? edit.nodeId
  : undefined

const collectSelectedNodeIds = (
  state: WorkingState
): ReadonlySet<NodeId> => {
  const ids = new Set<NodeId>()
  state.ui.nodes.forEach((view, nodeId) => {
    if (view.selected) {
      ids.add(nodeId)
    }
  })
  return ids
}

const collectSelectedEdgeIds = (
  state: WorkingState
): ReadonlySet<EdgeId> => {
  const ids = new Set<EdgeId>()
  state.ui.edges.forEach((view, edgeId) => {
    if (view.selected) {
      ids.add(edgeId)
    }
  })
  return ids
}

const hasSelection = (
  state: WorkingState
): boolean => {
  for (const view of state.ui.nodes.values()) {
    if (view.selected) {
      return true
    }
  }
  for (const view of state.ui.edges.values()) {
    if (view.selected) {
      return true
    }
  }
  return false
}

const buildCurrentNodeUiView = (input: {
  current: Input
  working: WorkingState
  nodeId: NodeId
  previous: NodeUiView | undefined
}): NodeUiView | undefined => {
  const graph = input.working.graph.nodes.get(input.nodeId)
  if (!graph) {
    return undefined
  }

  const next = buildNodeUiView({
    nodeId: input.nodeId,
    preview: input.current.runtime.session.preview.nodes.get(input.nodeId),
    draw: input.current.runtime.session.preview.draw,
    edit: input.current.runtime.session.edit,
    selection: input.current.runtime.interaction.selection,
    hover: input.current.runtime.interaction.hover
  })

  return input.previous && isNodeUiViewEqual(input.previous, next)
    ? input.previous
    : next
}

const buildCurrentEdgeUiView = (input: {
  current: Input
  working: WorkingState
  edgeId: EdgeId
  previous: EdgeUiView | undefined
}): EdgeUiView | undefined => {
  const view = input.working.graph.edges.get(input.edgeId)
  if (!view) {
    return undefined
  }

  const next = buildEdgeUiView({
    edgeId: input.edgeId,
    entry: {
      base: {
        edge: view.base.edge,
        nodes: view.base.nodes
      },
      draft: input.current.runtime.session.draft.edges.get(input.edgeId),
      preview: input.current.runtime.session.preview.edges.get(input.edgeId)
    },
    view,
    edit: input.current.runtime.session.edit,
    selection: input.current.runtime.interaction.selection
  })

  return input.previous && isEdgeUiViewEqual(input.previous, next)
    ? input.previous
    : next
}

const writeNodeDelta = (input: {
  delta: WorkingState['delta']['ui']['node']
  nodeId: NodeId
  previous: NodeUiView | undefined
  next: NodeUiView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.delta, input.nodeId)
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.delta, input.nodeId)
    return
  }

  idDelta.update(input.delta, input.nodeId)
}

const writeEdgeDelta = (input: {
  delta: WorkingState['delta']['ui']['edge']
  edgeId: EdgeId
  previous: EdgeUiView | undefined
  next: EdgeUiView | undefined
}) => {
  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined && input.next !== undefined) {
    idDelta.add(input.delta, input.edgeId)
    return
  }
  if (input.previous !== undefined && input.next === undefined) {
    idDelta.remove(input.delta, input.edgeId)
    return
  }

  idDelta.update(input.delta, input.edgeId)
}

const rebuildNodeUi = (input: {
  current: Input
  working: WorkingState
}): number => {
  const previous = input.working.ui.nodes
  const next = new Map<NodeId, NodeUiView>()
  let count = 0

  input.working.graph.nodes.forEach((_view, nodeId) => {
    const previousView = previous.get(nodeId)
    const nextView = buildCurrentNodeUiView({
      current: input.current,
      working: input.working,
      nodeId,
      previous: previousView
    })
    if (nextView === undefined) {
      return
    }

    next.set(nodeId, nextView)
    writeNodeDelta({
      delta: input.working.delta.ui.node,
      nodeId,
      previous: previousView,
      next: nextView
    })
    if (previousView !== nextView) {
      count += 1
    }
  })

  previous.forEach((previousView, nodeId) => {
    if (next.has(nodeId)) {
      return
    }

    writeNodeDelta({
      delta: input.working.delta.ui.node,
      nodeId,
      previous: previousView,
      next: undefined
    })
    count += 1
  })

  input.working.ui.nodes = next
  return count
}

const rebuildEdgeUi = (input: {
  current: Input
  working: WorkingState
}): number => {
  const previous = input.working.ui.edges
  const next = new Map<EdgeId, EdgeUiView>()
  let count = 0

  input.working.graph.edges.forEach((_view, edgeId) => {
    const previousView = previous.get(edgeId)
    const nextView = buildCurrentEdgeUiView({
      current: input.current,
      working: input.working,
      edgeId,
      previous: previousView
    })
    if (nextView === undefined) {
      return
    }

    next.set(edgeId, nextView)
    writeEdgeDelta({
      delta: input.working.delta.ui.edge,
      edgeId,
      previous: previousView,
      next: nextView
    })
    if (previousView !== nextView) {
      count += 1
    }
  })

  previous.forEach((previousView, edgeId) => {
    if (next.has(edgeId)) {
      return
    }

    writeEdgeDelta({
      delta: input.working.delta.ui.edge,
      edgeId,
      previous: previousView,
      next: undefined
    })
    count += 1
  })

  input.working.ui.edges = next
  return count
}

const patchTouchedNodeUi = (input: {
  current: Input
  working: WorkingState
  touchedNodeIds: ReadonlySet<NodeId>
}): number => {
  const nodes = input.working.ui.nodes
  let count = 0

  input.touchedNodeIds.forEach((nodeId) => {
    const previous = nodes.get(nodeId)
    const next = buildCurrentNodeUiView({
      current: input.current,
      working: input.working,
      nodeId,
      previous
    })

    if (next === undefined) {
      if (previous !== undefined) {
        nodes.delete(nodeId)
        writeNodeDelta({
          delta: input.working.delta.ui.node,
          nodeId,
          previous,
          next
        })
        count += 1
      }
      return
    }

    nodes.set(nodeId, next)
    writeNodeDelta({
      delta: input.working.delta.ui.node,
      nodeId,
      previous,
      next
    })
    if (previous !== next) {
      count += 1
    }
  })

  return count
}

const patchTouchedEdgeUi = (input: {
  current: Input
  working: WorkingState
  touchedEdgeIds: ReadonlySet<EdgeId>
}): number => {
  const edges = input.working.ui.edges
  let count = 0

  input.touchedEdgeIds.forEach((edgeId) => {
    const previous = edges.get(edgeId)
    const next = buildCurrentEdgeUiView({
      current: input.current,
      working: input.working,
      edgeId,
      previous
    })

    if (next === undefined) {
      if (previous !== undefined) {
        edges.delete(edgeId)
        writeEdgeDelta({
          delta: input.working.delta.ui.edge,
          edgeId,
          previous,
          next
        })
        count += 1
      }
      return
    }

    edges.set(edgeId, next)
    writeEdgeDelta({
      delta: input.working.delta.ui.edge,
      edgeId,
      previous,
      next
    })
    if (previous !== next) {
      count += 1
    }
  })

  return count
}

const patchChrome = (input: {
  current: Input
  working: WorkingState
  force: boolean
}): number => {
  if (!input.force) {
    return 0
  }

  const previous = input.working.ui.chrome
  const nextCandidate = buildChromeView({
    session: input.current.runtime.session,
    selection: input.current.runtime.interaction.selection,
    hover: input.current.runtime.interaction.hover
  })
  const next = isChromeViewEqual(previous, nextCandidate)
    ? previous
    : nextCandidate

  input.working.ui.chrome = next
  input.working.delta.ui.chrome = next !== previous
  return next !== previous ? 1 : 0
}

export const patchUiState = (input: {
  current: Input
  working: WorkingState
  reset: boolean
}): number => {
  input.working.delta.ui = uiChange.create()

  const touchedNodeIds = new Set<NodeId>()
  const touchedEdgeIds = new Set<EdgeId>()
  let chrome = false

  appendIds(touchedNodeIds, idDelta.touched(input.working.delta.graph.entities.nodes))
  appendIds(touchedEdgeIds, idDelta.touched(input.working.delta.graph.entities.edges))
  appendMindmapNodeIds({
    target: touchedNodeIds,
    mindmapIds: idDelta.touched(input.working.delta.graph.entities.mindmaps),
    working: input.working
  })

  appendIds(touchedEdgeIds, idDelta.touched(input.current.runtime.delta.session.draft.edges))
  appendIds(touchedNodeIds, idDelta.touched(input.current.runtime.delta.session.preview.nodes))
  appendIds(touchedEdgeIds, idDelta.touched(input.current.runtime.delta.session.preview.edges))
  appendMindmapNodeIds({
    target: touchedNodeIds,
    mindmapIds: idDelta.touched(input.current.runtime.delta.session.preview.mindmaps),
    working: input.working
  })
  appendMindmapNodeIds({
    target: touchedNodeIds,
    mindmapIds: input.current.runtime.delta.clock.mindmaps,
    working: input.working
  })

  if (
    input.current.runtime.delta.session.preview.mindmaps.added.size > 0
    || input.current.runtime.delta.session.preview.mindmaps.updated.size > 0
    || input.current.runtime.delta.session.preview.mindmaps.removed.size > 0
  ) {
    chrome = true
  }

  if (input.current.runtime.delta.session.selection) {
    appendIds(touchedNodeIds, collectSelectedNodeIds(input.working))
    appendIds(touchedEdgeIds, collectSelectedEdgeIds(input.working))
    appendIds(touchedNodeIds, input.current.runtime.interaction.selection.nodeIds)
    appendIds(touchedEdgeIds, input.current.runtime.interaction.selection.edgeIds)

    chrome = chrome || (
      hasSelection(input.working)
      !== (
        input.current.runtime.interaction.selection.nodeIds.length > 0
        || input.current.runtime.interaction.selection.edgeIds.length > 0
      )
    )
  }

  if (input.current.runtime.delta.session.hover) {
    chrome = true

    const previousNodeId = readHoveredNodeId(input.working.ui.chrome.hover)
    const nextNodeId = readHoveredNodeId(input.current.runtime.interaction.hover)
    const previousEdgeId = readHoveredEdgeId(input.working.ui.chrome.hover)
    const nextEdgeId = readHoveredEdgeId(input.current.runtime.interaction.hover)

    if (previousNodeId) {
      touchedNodeIds.add(previousNodeId)
    }
    if (nextNodeId) {
      touchedNodeIds.add(nextNodeId)
    }
    if (previousEdgeId) {
      touchedEdgeIds.add(previousEdgeId)
    }
    if (nextEdgeId) {
      touchedEdgeIds.add(nextEdgeId)
    }
  }

  if (input.current.runtime.delta.session.preview.marquee) {
    chrome = true
  }
  if (input.current.runtime.delta.session.preview.guides) {
    chrome = true
  }
  if (input.current.runtime.delta.session.preview.draw) {
    chrome = true
    appendIds(
      touchedNodeIds,
      input.working.ui.chrome.preview.draw?.hiddenNodeIds ?? []
    )
    appendIds(
      touchedNodeIds,
      input.current.runtime.session.preview.draw?.hiddenNodeIds ?? []
    )
  }
  if (input.current.runtime.delta.session.edit) {
    chrome = true

    const previousEditingNode = readEditingNodeId(input.working.ui.chrome.edit)
    const nextEditingNode = readEditingNodeId(input.current.runtime.session.edit)
    const previousEditingEdge = readEditingEdgeId(input.working.ui.chrome.edit)
    const nextEditingEdge = readEditingEdgeId(input.current.runtime.session.edit)

    if (previousEditingNode) {
      touchedNodeIds.add(previousEditingNode)
    }
    if (nextEditingNode) {
      touchedNodeIds.add(nextEditingNode)
    }
    if (previousEditingEdge) {
      touchedEdgeIds.add(previousEditingEdge)
    }
    if (nextEditingEdge) {
      touchedEdgeIds.add(nextEditingEdge)
    }
  }
  if (
    input.current.runtime.delta.session.tool
    || input.current.runtime.delta.session.interaction
    || input.current.runtime.delta.session.preview.edgeGuide
  ) {
    chrome = true
  }

  if (
    !input.reset
    && !chrome
    && touchedNodeIds.size === 0
    && touchedEdgeIds.size === 0
  ) {
    return 0
  }

  const uiCount = input.reset
    ? (
        rebuildNodeUi(input)
        + rebuildEdgeUi(input)
      )
    : (
        patchTouchedNodeUi({
          current: input.current,
          working: input.working,
          touchedNodeIds
        })
        + patchTouchedEdgeUi({
          current: input.current,
          working: input.working,
          touchedEdgeIds
        })
      )

  input.working.graph.state.node = input.working.ui.nodes
  input.working.graph.state.edge = input.working.ui.edges

  const chromeCount = patchChrome({
    current: input.current,
    working: input.working,
    force: input.reset || chrome
  })
  input.working.graph.state.chrome = input.working.ui.chrome

  return uiCount + chromeCount
}
