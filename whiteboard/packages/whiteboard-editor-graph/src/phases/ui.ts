import { idDelta } from '@shared/projector/delta'
import type {
  EdgeId,
  NodeId
} from '@whiteboard/core/types'
import type {
  EdgeUiView,
  NodeUiView
} from '../contracts/editor'
import {
  isChromeViewEqual,
  isEdgeUiViewEqual,
  isNodeUiViewEqual
} from '../domain/equality'
import {
  hasUiPublishDelta,
  resetUiPublishDelta
} from '../projector/publish/delta'
import {
  buildChromeView,
  buildEdgeUiView,
  buildNodeUiView
} from '../domain/ui'
import {
  type EditorGraphPhase,
  defineEditorGraphPhase,
  toPhaseMetrics
} from '../projector/context'
import {
  mergeUiPatchScope,
  normalizeUiPatchScope,
  readUiPatchScopeKeys
} from '../projector/scopes/uiScope'

type UiPhaseContext = Parameters<EditorGraphPhase<'ui'>['run']>[0]

const writeUiChange = <TId extends string, TValue>(input: {
  id: TId
  previous: TValue | undefined
  next: TValue | undefined
  delta: {
    added: Set<TId>
    updated: Set<TId>
    removed: Set<TId>
  }
}) => {
  if (input.next === undefined) {
    if (input.previous !== undefined) {
      idDelta.remove(input.delta, input.id)
    }
    return
  }

  if (input.previous === input.next) {
    return
  }

  if (input.previous === undefined) {
    idDelta.add(input.delta, input.id)
    return
  }

  idDelta.update(input.delta, input.id)
}

const buildCurrentNodeUiView = (
  context: UiPhaseContext,
  nodeId: NodeId,
  previous: NodeUiView | undefined
): NodeUiView | undefined => {
  const graph = context.working.graph.nodes.get(nodeId)
  if (!graph) {
    return undefined
  }

  const next = buildNodeUiView({
    nodeId,
    draft: context.input.session.draft.nodes.get(nodeId),
    preview: context.input.session.preview.nodes.get(nodeId),
    draw: context.input.session.preview.draw,
    edit: context.input.session.edit,
    selection: context.input.interaction.selection,
    hover: context.input.interaction.hover
  })

  return previous && isNodeUiViewEqual(previous, next)
    ? previous
    : next
}

const buildCurrentEdgeUiView = (
  context: UiPhaseContext,
  edgeId: EdgeId,
  previous: EdgeUiView | undefined
): EdgeUiView | undefined => {
  const view = context.working.graph.edges.get(edgeId)
  if (!view) {
    return undefined
  }

  const next = buildEdgeUiView({
    edgeId,
    entry: {
      base: {
        edge: view.base.edge,
        nodes: view.base.nodes
      },
      draft: context.input.session.draft.edges.get(edgeId),
      preview: context.input.session.preview.edges.get(edgeId)
    },
    view,
    edit: context.input.session.edit,
    selection: context.input.interaction.selection
  })

  return previous && isEdgeUiViewEqual(previous, next)
    ? previous
    : next
}

const rebuildNodeUi = (
  context: UiPhaseContext,
  delta: {
    added: Set<NodeId>
    updated: Set<NodeId>
    removed: Set<NodeId>
  }
) => {
  const previous = context.working.ui.nodes
  const next = new Map<NodeId, NodeUiView>()

  context.working.graph.nodes.forEach((_view, nodeId) => {
    const previousView = previous.get(nodeId)
    const nextView = buildCurrentNodeUiView(context, nodeId, previousView)
    if (nextView === undefined) {
      return
    }

    next.set(nodeId, nextView)
    writeUiChange({
      id: nodeId,
      previous: previousView,
      next: nextView,
      delta
    })
  })

  previous.forEach((_view, nodeId) => {
    if (next.has(nodeId)) {
      return
    }

    writeUiChange({
      id: nodeId,
      previous: previous.get(nodeId),
      next: undefined,
      delta
    })
  })

  context.working.ui.nodes = next
}

const rebuildEdgeUi = (
  context: UiPhaseContext,
  delta: {
    added: Set<EdgeId>
    updated: Set<EdgeId>
    removed: Set<EdgeId>
  }
) => {
  const previous = context.working.ui.edges
  const next = new Map<EdgeId, EdgeUiView>()

  context.working.graph.edges.forEach((_view, edgeId) => {
    const previousView = previous.get(edgeId)
    const nextView = buildCurrentEdgeUiView(context, edgeId, previousView)
    if (nextView === undefined) {
      return
    }

    next.set(edgeId, nextView)
    writeUiChange({
      id: edgeId,
      previous: previousView,
      next: nextView,
      delta
    })
  })

  previous.forEach((_view, edgeId) => {
    if (next.has(edgeId)) {
      return
    }

    writeUiChange({
      id: edgeId,
      previous: previous.get(edgeId),
      next: undefined,
      delta
    })
  })

  context.working.ui.edges = next
}

const patchTouchedNodeUi = (
  context: UiPhaseContext,
  touchedNodeIds: ReadonlySet<NodeId>,
  delta: {
    added: Set<NodeId>
    updated: Set<NodeId>
    removed: Set<NodeId>
  }
) => {
  const nodes = context.working.ui.nodes as Map<NodeId, NodeUiView>

  touchedNodeIds.forEach((nodeId) => {
    const previous = nodes.get(nodeId)
    const next = buildCurrentNodeUiView(context, nodeId, previous)

    if (next === undefined) {
      if (previous !== undefined) {
        nodes.delete(nodeId)
      }
    } else {
      nodes.set(nodeId, next)
    }

    writeUiChange({
      id: nodeId,
      previous,
      next,
      delta
    })
  })
}

const patchTouchedEdgeUi = (
  context: UiPhaseContext,
  touchedEdgeIds: ReadonlySet<EdgeId>,
  delta: {
    added: Set<EdgeId>
    updated: Set<EdgeId>
    removed: Set<EdgeId>
  }
) => {
  const edges = context.working.ui.edges as Map<EdgeId, EdgeUiView>

  touchedEdgeIds.forEach((edgeId) => {
    const previous = edges.get(edgeId)
    const next = buildCurrentEdgeUiView(context, edgeId, previous)

    if (next === undefined) {
      if (previous !== undefined) {
        edges.delete(edgeId)
      }
    } else {
      edges.set(edgeId, next)
    }

    writeUiChange({
      id: edgeId,
      previous,
      next,
      delta
    })
  })
}

const patchChrome = (
  context: UiPhaseContext,
  force: boolean
) => {
  if (!force) {
    return
  }

  const previous = context.working.ui.chrome
  const nextCandidate = buildChromeView({
    session: context.input.session,
    selection: context.input.interaction.selection,
    hover: context.input.interaction.hover
  })
  const next = isChromeViewEqual(previous, nextCandidate)
    ? previous
    : nextCandidate

  context.working.ui.chrome = next
  context.working.publish.ui.delta.chrome = next !== previous
}

export const uiPhase = defineEditorGraphPhase({
  name: 'ui',
  deps: [],
  mergeScope: mergeUiPatchScope,
  run: (context) => {
    const scope = normalizeUiPatchScope(context.scope)
    const revision = context.previous.revision + 1
    const publish = context.working.publish.ui
    const touchedNodeIds = readUiPatchScopeKeys(scope.nodes)
    const touchedEdgeIds = readUiPatchScopeKeys(scope.edges)

    resetUiPublishDelta(publish.delta)

    if (scope.reset) {
      rebuildNodeUi(context, publish.delta.nodes)
      rebuildEdgeUi(context, publish.delta.edges)
    } else {
      patchTouchedNodeUi(context, touchedNodeIds, publish.delta.nodes)
      patchTouchedEdgeUi(context, touchedEdgeIds, publish.delta.edges)
    }

    patchChrome(context, scope.reset || scope.chrome)

    publish.revision = hasUiPublishDelta(publish.delta)
      ? revision
      : 0

    return {
      action: publish.revision === revision
        ? 'sync'
        : 'reuse',
      metrics: toPhaseMetrics(
        (scope.reset
          ? context.working.ui.nodes.size + context.working.ui.edges.size
          : touchedNodeIds.size + touchedEdgeIds.size)
        + context.working.ui.chrome.overlays.length
      )
    }
  }
})
