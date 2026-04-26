import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type { ViewPatchScope } from '../../contracts/delta'
import type {
  EdgeUiView,
  Input,
  NodeUiView,
  SceneItem
} from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import { buildItems } from '../../domain/items'
import { patchRenderState } from '../../domain/render'
import {
  buildChromeView,
  buildEdgeUiView,
  buildNodeUiView,
  isChromeViewEqual,
  isEdgeUiViewEqual,
  isNodeUiViewEqual
} from '../../domain/ui'

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
    draft: input.current.session.draft.nodes.get(input.nodeId),
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
    if (previousView !== nextView) {
      count += 1
    }
  })

  previous.forEach((_view, nodeId) => {
    if (!next.has(nodeId)) {
      count += 1
    }
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
    if (previousView !== nextView) {
      count += 1
    }
  })

  previous.forEach((_view, edgeId) => {
    if (!next.has(edgeId)) {
      count += 1
    }
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
        count += 1
      }
      return
    }

    nodes.set(nodeId, next)
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
        count += 1
      }
      return
    }

    edges.set(edgeId, next)
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
  return next !== previous ? 1 : 0
}

const isSceneItemEqual = (
  left: SceneItem,
  right: SceneItem
) => left.kind === right.kind
  && left.id === right.id

const patchItems = (input: {
  current: Input
  working: WorkingState
  force: boolean
}): number => {
  if (!input.force) {
    return 0
  }

  const previous = input.working.items
  const next = buildItems(input.current.document.snapshot)
  const same = previous.length === next.length
    && previous.every((item, index) => isSceneItemEqual(item, next[index]!))
  if (same) {
    return 0
  }

  input.working.items = next
  return next.length
}

export const patchViewState = (input: {
  current: Input
  working: WorkingState
  scope: ViewPatchScope
}): number => {
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

  return (
    uiCount
    + patchChrome({
        current: input.current,
        working: input.working,
        force: input.scope.reset || input.scope.chrome
      })
    + patchItems({
        current: input.current,
        working: input.working,
        force: input.scope.reset || input.scope.items
      })
    + patchRenderState({
        current: input.current,
        working: input.working,
        scope: input.scope
      })
  )
}
