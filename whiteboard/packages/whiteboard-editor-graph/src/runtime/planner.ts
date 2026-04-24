import { keySet, type KeySet } from '@shared/core'
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
import {
  createSpatialPatchScope,
  hasSpatialPatchScope
} from './spatial/contracts'

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

const createSpatialPlannerScope = (
  input: Input
) => createSpatialPatchScope({
  visible: hasSceneDelta(input.delta.scene)
})

const appendIdDelta = <TId extends string>(
  target: KeySet<TId>,
  delta: {
    added: ReadonlySet<TId>
    updated: ReadonlySet<TId>
    removed: ReadonlySet<TId>
  }
): KeySet<TId> => keySet.addMany(
  keySet.addMany(
    keySet.addMany(target, delta.added),
    delta.updated
  ),
  delta.removed
)

const appendMapKeys = <TId extends string>(
  target: KeySet<TId>,
  entries: ReadonlyMap<TId, unknown>
): KeySet<TId> => keySet.addMany(target, entries.keys())

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

  scope.nodes = appendIdDelta(scope.nodes, delta.document.nodes)
  scope.edges = appendIdDelta(scope.edges, delta.document.edges)
  scope.mindmaps = appendIdDelta(scope.mindmaps, delta.document.mindmaps)
  scope.groups = appendIdDelta(scope.groups, delta.document.groups)

  scope.nodes = appendIdDelta(scope.nodes, delta.graph.nodes.draft)
  scope.nodes = appendIdDelta(scope.nodes, delta.graph.nodes.preview)
  scope.nodes = appendIdDelta(scope.nodes, delta.graph.nodes.edit)
  scope.edges = appendIdDelta(scope.edges, delta.graph.edges.preview)
  scope.edges = appendIdDelta(scope.edges, delta.graph.edges.edit)
  scope.mindmaps = appendIdDelta(scope.mindmaps, delta.graph.mindmaps.preview)
  delta.graph.mindmaps.tick.forEach((mindmapId) => {
    scope.mindmaps = keySet.add(scope.mindmaps, mindmapId)
  })

  scope.nodes = appendMapKeys(scope.nodes, input.session.draft.nodes)
  scope.edges = appendMapKeys(scope.edges, input.session.draft.edges)
  scope.nodes = appendMapKeys(scope.nodes, input.session.preview.nodes)
  scope.edges = appendMapKeys(scope.edges, input.session.preview.edges)

  if (input.session.edit?.kind === 'node') {
    scope.nodes = keySet.add(scope.nodes, input.session.edit.nodeId)
  }
  if (input.session.edit?.kind === 'edge-label') {
    scope.edges = keySet.add(scope.edges, input.session.edit.edgeId)
  }

  if (input.session.preview.mindmap?.rootMove) {
    scope.mindmaps = keySet.add(
      scope.mindmaps,
      input.session.preview.mindmap.rootMove.mindmapId
    )
  }
  if (input.session.preview.mindmap?.subtreeMove) {
    scope.mindmaps = keySet.add(
      scope.mindmaps,
      input.session.preview.mindmap.subtreeMove.mindmapId
    )
  }
  input.session.preview.mindmap?.enter?.forEach((entry) => {
    scope.mindmaps = keySet.add(scope.mindmaps, entry.mindmapId)
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
    const spatialScope = createSpatialPlannerScope(input)
    const graphChanged = hasGraphPatchScope(graphScope)
    const uiChanged = graphChanged || hasUiDelta(input.delta.ui)
    const spatialChanged = hasSpatialPatchScope(spatialScope)

    if (!graphChanged && !uiChanged && !spatialChanged) {
      return createPlan<EditorPhaseName>()
    }

    if (graphChanged) {
      return createPlan<EditorPhaseName, EditorPhaseScopeMap>({
        phases: new Set(
          spatialChanged
            ? ['graph', 'spatial']
            : ['graph']
        ),
        scope: {
          graph: graphScope,
          spatial: spatialChanged ? spatialScope : undefined
        }
      })
    }

    if (uiChanged && spatialChanged) {
      return createPlan<EditorPhaseName, EditorPhaseScopeMap>({
        phases: new Set([
          'ui',
          'spatial'
        ]),
        scope: {
          spatial: spatialScope
        }
      })
    }

    if (uiChanged) {
      return createPlan<EditorPhaseName>({
        phases: new Set([
          'ui'
        ])
      })
    }

    if (spatialChanged) {
      return createPlan<EditorPhaseName, EditorPhaseScopeMap>({
        phases: new Set([
          'spatial'
        ]),
        scope: {
          spatial: spatialScope
        }
      })
    }

    return createPlan<EditorPhaseName>()
  }
})
