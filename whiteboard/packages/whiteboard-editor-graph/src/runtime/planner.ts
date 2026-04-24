import { changeSet, keySet } from '@shared/core'
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

  scope.nodes = keySet.addMany(scope.nodes, changeSet.touched(delta.document.nodes))
  scope.edges = keySet.addMany(scope.edges, changeSet.touched(delta.document.edges))
  scope.mindmaps = keySet.addMany(scope.mindmaps, changeSet.touched(delta.document.mindmaps))
  scope.groups = keySet.addMany(scope.groups, changeSet.touched(delta.document.groups))

  scope.nodes = keySet.addMany(scope.nodes, changeSet.touched(delta.graph.nodes.draft))
  scope.nodes = keySet.addMany(scope.nodes, changeSet.touched(delta.graph.nodes.preview))
  scope.nodes = keySet.addMany(scope.nodes, changeSet.touched(delta.graph.nodes.edit))
  scope.edges = keySet.addMany(scope.edges, changeSet.touched(delta.graph.edges.preview))
  scope.edges = keySet.addMany(scope.edges, changeSet.touched(delta.graph.edges.edit))
  scope.mindmaps = keySet.addMany(scope.mindmaps, changeSet.touched(delta.graph.mindmaps.preview))
  delta.graph.mindmaps.tick.forEach((mindmapId) => {
    scope.mindmaps = keySet.add(scope.mindmaps, mindmapId)
  })

  scope.nodes = keySet.addMany(scope.nodes, input.session.draft.nodes.keys())
  scope.edges = keySet.addMany(scope.edges, input.session.draft.edges.keys())
  scope.nodes = keySet.addMany(scope.nodes, input.session.preview.nodes.keys())
  scope.edges = keySet.addMany(scope.edges, input.session.preview.edges.keys())

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
    const graphChanged = hasGraphPatchScope(graphScope)
    const uiChanged = hasUiDelta(input.delta.ui)

    if (!graphChanged && !uiChanged) {
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

    if (uiChanged) {
      return createPlan<EditorPhaseName>({
        phases: new Set([
          'ui'
        ])
      })
    }

    return createPlan<EditorPhaseName>()
  }
})
