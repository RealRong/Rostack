import {
  createPlan,
  type RuntimePlanner
} from '@shared/projection-runtime'
import type {
  Input,
  Snapshot
} from '../contracts/editor'
import type { EditorPhaseName } from './phaseNames'

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

const hasInputDelta = (
  delta: Input['delta']
): boolean => (
  hasDocumentDelta(delta.document)
  || hasGraphDelta(delta.graph)
  || hasUiDelta(delta.ui)
  || hasSceneDelta(delta.scene)
)

export const createEditorGraphPlanner = (): RuntimePlanner<
  Input,
  Snapshot,
  EditorPhaseName
> => ({
  plan: ({ input, previous }) => {
    const bootstrap = previous.revision === 0
    if (!bootstrap && !hasInputDelta(input.delta)) {
      return createPlan<EditorPhaseName>()
    }

    const graphChanged = bootstrap
      || hasDocumentDelta(input.delta.document)
      || hasGraphDelta(input.delta.graph)

    const uiChanged = graphChanged || hasUiDelta(input.delta.ui)
    const sceneChanged = graphChanged || hasSceneDelta(input.delta.scene)

    if (graphChanged) {
      return createPlan<EditorPhaseName>({
        phases: new Set([
          'graph'
        ])
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
