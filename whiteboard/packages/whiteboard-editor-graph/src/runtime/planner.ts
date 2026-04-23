import {
  createPlan,
  type RuntimePlanner
} from '@shared/projection-runtime'
import type {
  EditorPhaseScopeMap,
  GraphPatchScope
} from '../contracts/delta'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import type { EditorPhaseName } from './phaseNames'
import {
  createGraphPatchScope,
  hasGraphPatchScope
} from './graphPatch/scope'

const hasIdDelta = <TId extends string>(
  delta: {
    added: ReadonlySet<TId>
    updated: ReadonlySet<TId>
    removed: ReadonlySet<TId>
  }
): boolean => (
  delta.added.size > 0
  || delta.updated.size > 0
  || delta.removed.size > 0
)

const hasDocumentDelta = (
  delta: Input['delta']['document']
): boolean => (
  delta.reset
  || delta.order
  || hasIdDelta(delta.nodes)
  || hasIdDelta(delta.edges)
  || hasIdDelta(delta.mindmaps)
  || hasIdDelta(delta.groups)
)

const hasGraphDelta = (
  delta: Input['delta']['graph']
): boolean => (
  hasIdDelta(delta.nodes.draft)
  || hasIdDelta(delta.nodes.preview)
  || hasIdDelta(delta.nodes.edit)
  || hasIdDelta(delta.edges.preview)
  || hasIdDelta(delta.edges.edit)
  || hasIdDelta(delta.mindmaps.preview)
  || delta.mindmaps.tick.size > 0
)

const hasUiDelta = (
  delta: Input['delta']['ui']
): boolean => (
  delta.tool
  || delta.selection
  || delta.hover
  || delta.marquee
  || delta.guides
  || delta.draw
  || delta.edit
)

const hasSceneDelta = (
  delta: Input['delta']['scene']
): boolean => delta.viewport

const appendIdDelta = <TId extends string>(
  target: Set<TId>,
  delta: {
    added: ReadonlySet<TId>
    updated: ReadonlySet<TId>
    removed: ReadonlySet<TId>
  }
) => {
  delta.added.forEach((id) => {
    target.add(id)
  })
  delta.updated.forEach((id) => {
    target.add(id)
  })
  delta.removed.forEach((id) => {
    target.add(id)
  })
}

const appendMapKeys = <TId extends string>(
  target: Set<TId>,
  entries: ReadonlyMap<TId, unknown>
) => {
  entries.forEach((_value, id) => {
    target.add(id)
  })
}

const createGraphPlannerScope = (
  input: Input
): GraphPatchScope => {
  const scope = createGraphPatchScope()
  const { delta } = input

  if (delta.document.reset) {
    return createGraphPatchScope({
      reset: true,
      order: true
    })
  }

  scope.order = delta.document.order

  appendIdDelta(scope.nodes, delta.document.nodes)
  appendIdDelta(scope.edges, delta.document.edges)
  appendIdDelta(scope.mindmaps, delta.document.mindmaps)
  appendIdDelta(scope.groups, delta.document.groups)

  appendIdDelta(scope.nodes, delta.graph.nodes.draft)
  appendIdDelta(scope.nodes, delta.graph.nodes.preview)
  appendIdDelta(scope.nodes, delta.graph.nodes.edit)
  appendIdDelta(scope.edges, delta.graph.edges.preview)
  appendIdDelta(scope.edges, delta.graph.edges.edit)
  appendIdDelta(scope.mindmaps, delta.graph.mindmaps.preview)
  delta.graph.mindmaps.tick.forEach((mindmapId) => {
    scope.mindmaps.add(mindmapId)
  })

  appendMapKeys(scope.nodes, input.session.draft.nodes)
  appendMapKeys(scope.edges, input.session.draft.edges)
  appendMapKeys(scope.nodes, input.session.preview.nodes)
  appendMapKeys(scope.edges, input.session.preview.edges)

  if (input.session.edit?.kind === 'node') {
    scope.nodes.add(input.session.edit.nodeId)
  }
  if (input.session.edit?.kind === 'edge-label') {
    scope.edges.add(input.session.edit.edgeId)
  }

  if (input.session.preview.mindmap?.rootMove) {
    scope.mindmaps.add(input.session.preview.mindmap.rootMove.mindmapId)
  }
  if (input.session.preview.mindmap?.subtreeMove) {
    scope.mindmaps.add(input.session.preview.mindmap.subtreeMove.mindmapId)
  }
  input.session.preview.mindmap?.enter?.forEach((entry) => {
    scope.mindmaps.add(entry.mindmapId)
  })

  return scope
}

export const createEditorGraphPlanner = (): RuntimePlanner<
  Input,
  Snapshot,
  EditorPhaseName,
  EditorPhaseScopeMap
> => ({
  plan: ({ input, previous }) => {
    const bootstrap = previous.revision === 0
    const graphScope = bootstrap
      ? createGraphPatchScope({
          reset: true,
          order: true
        })
      : createGraphPlannerScope(input)
    const graphChanged = hasGraphPatchScope(graphScope)
    const uiChanged = graphChanged || hasUiDelta(input.delta.ui)
    const sceneChanged = graphChanged || hasSceneDelta(input.delta.scene)

    if (!graphChanged && !uiChanged && !sceneChanged) {
      return createPlan<EditorPhaseName>()
    }

    if (graphChanged) {
      return createPlan<EditorPhaseName, EditorPhaseScopeMap>({
        phases: new Set([
          'graph'
        ]),
        scope: {
          graph: graphScope
        }
      })
    }

    if (uiChanged && sceneChanged) {
      return createPlan<EditorPhaseName>({
        phases: new Set([
          'ui',
          'scene'
        ])
      })
    }

    if (uiChanged) {
      return createPlan<EditorPhaseName>({
        phases: new Set([
          'ui'
        ])
      })
    }

    if (sceneChanged) {
      return createPlan<EditorPhaseName>({
        phases: new Set([
          'scene'
        ])
      })
    }

    return createPlan<EditorPhaseName>()
  }
})
