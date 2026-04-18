import {
  createDerivedStore,
  createProjectedKeyedStore,
  createProjectedStore,
  read,
  type ReadStore
} from '@shared/core'
import type { Guide } from '@whiteboard/core/node'
import type { ViewportRuntime } from '@whiteboard/editor/local/viewport/runtime'
import {
  EMPTY_EDGE_GUIDE,
  EMPTY_EDGE_FEEDBACK_PROJECTION,
  isEdgeGuideEqual,
  isEdgeProjectionEqual,
  toEdgeFeedbackMap
} from '@whiteboard/editor/input/preview/edge'
import {
  EMPTY_NODE_FEEDBACK_PROJECTION,
  isNodeProjectionEqual,
  toNodeFeedbackMap
} from '@whiteboard/editor/input/preview/node'
import {
  EMPTY_GUIDES,
  isMarqueeFeedbackEqual,
  projectWorldRect
} from '@whiteboard/editor/input/preview/selection'
import type {
  EditorInputPreview,
  EditorInputPreviewState,
  MarqueePreview
} from '@whiteboard/editor/input/preview/types'

export const createInputPreviewSelectors = ({
  state,
  viewport
}: {
  state: ReadStore<EditorInputPreviewState>
  viewport: ViewportRuntime['read']
}): EditorInputPreview['selectors'] => {
  const node = createProjectedKeyedStore({
    source: state,
    select: toNodeFeedbackMap,
    emptyValue: EMPTY_NODE_FEEDBACK_PROJECTION,
    isEqual: isNodeProjectionEqual,
    schedule: 'microtask'
  })
  const edge = createProjectedKeyedStore({
    source: state,
    select: toEdgeFeedbackMap,
    emptyValue: EMPTY_EDGE_FEEDBACK_PROJECTION,
    isEqual: isEdgeProjectionEqual,
    schedule: 'raf'
  })
  const draw = createProjectedStore({
    source: state,
    select: (next) => next.draw.preview,
    isEqual: (left, right) => left === right,
    schedule: 'raf'
  })
  const edgeGuide = createProjectedStore({
    source: state,
    select: (next) => next.edge.guide ?? EMPTY_EDGE_GUIDE,
    isEqual: isEdgeGuideEqual,
    schedule: 'raf'
  })
  const mindmapPreview = createProjectedStore({
    source: state,
    select: (next) => next.mindmap.preview,
    isEqual: (left, right) => left === right,
    schedule: 'raf'
  })
  const snap = createProjectedStore({
    source: state,
    select: (next) => next.selection.guides.length > 0
      ? next.selection.guides
      : EMPTY_GUIDES,
    isEqual: (left: readonly Guide[], right: readonly Guide[]) => left === right,
    schedule: 'raf'
  })
  const marquee = createDerivedStore<MarqueePreview | undefined>({
    get: () => {
      const next = read(state).selection.marquee
      read(viewport)
      if (!next) {
        return undefined
      }

      return {
        rect: projectWorldRect(viewport, next.worldRect),
        match: next.match
      }
    },
    isEqual: isMarqueeFeedbackEqual
  })

  return {
    node,
    edge,
    draw,
    marquee,
    mindmapPreview,
    edgeGuide,
    snap
  }
}
