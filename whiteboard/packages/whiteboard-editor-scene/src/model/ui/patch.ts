import { idDelta } from '@shared/delta'
import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type { UiPatchScope } from '../../contracts/delta'
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
    preview: input.current.session.preview.nodes.get(input.nodeId),
    draw: input.current.session.preview.draw,
    edit: input.current.session.edit,
    selection: input.current.interaction.selection,
    hover: input.current.interaction.hover
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
      draft: input.current.session.draft.edges.get(input.edgeId),
      preview: input.current.session.preview.edges.get(input.edgeId)
    },
    view,
    edit: input.current.session.edit,
    selection: input.current.interaction.selection
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
    session: input.current.session,
    selection: input.current.interaction.selection,
    hover: input.current.interaction.hover
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
  scope: UiPatchScope
}): number => {
  input.working.delta.ui = uiChange.create()

  const uiCount = input.scope.reset
    ? (
        rebuildNodeUi(input)
        + rebuildEdgeUi(input)
      )
    : (
        patchTouchedNodeUi({
          current: input.current,
          working: input.working,
          touchedNodeIds: input.scope.nodes
        })
        + patchTouchedEdgeUi({
          current: input.current,
          working: input.working,
          touchedEdgeIds: input.scope.edges
        })
      )

  input.working.graph.state.node = input.working.ui.nodes
  input.working.graph.state.edge = input.working.ui.edges

  const chromeCount = patchChrome({
    current: input.current,
    working: input.working,
    force: input.scope.reset || input.scope.chrome
  })
  input.working.graph.state.chrome = input.working.ui.chrome

  return uiCount + chromeCount
}
