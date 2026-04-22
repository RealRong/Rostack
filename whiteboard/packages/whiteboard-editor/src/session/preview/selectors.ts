import { store } from '@shared/core'
import type { Guide } from '@whiteboard/core/node'
import type { ViewportRuntime } from '@whiteboard/editor/session/viewport'
import {
  EMPTY_EDGE_GUIDE,
  EMPTY_EDGE_FEEDBACK_PROJECTION,
  isEdgeGuideEqual,
  isEdgeProjectionEqual,
  toEdgeFeedbackMap
} from '@whiteboard/editor/session/preview/edge'
import {
  EMPTY_NODE_FEEDBACK_PROJECTION,
  isNodeProjectionEqual,
  toNodeFeedbackMap
} from '@whiteboard/editor/session/preview/node'
import {
  EMPTY_GUIDES,
  isMarqueeFeedbackEqual,
  projectWorldRect
} from '@whiteboard/editor/session/preview/selection'
import type {
  EditorInputPreview,
  EditorInputPreviewState,
  MarqueePreview
} from '@whiteboard/editor/session/preview/types'

export const createInputPreviewSelectors = ({
  state,
  viewport
}: {
  state: store.ReadStore<EditorInputPreviewState>
  viewport: ViewportRuntime['read']
}): EditorInputPreview['selectors'] => {
  const node = store.createProjectedKeyedStore({
    source: state,
    select: toNodeFeedbackMap,
    emptyValue: EMPTY_NODE_FEEDBACK_PROJECTION,
    isEqual: isNodeProjectionEqual,
    schedule: 'microtask'
  })
  const edge = store.createProjectedKeyedStore({
    source: state,
    select: toEdgeFeedbackMap,
    emptyValue: EMPTY_EDGE_FEEDBACK_PROJECTION,
    isEqual: isEdgeProjectionEqual,
    schedule: 'frame'
  })
  const draw = store.createProjectedStore({
    source: state,
    select: (next) => next.draw.preview,
    isEqual: (left, right) => left === right,
    schedule: 'frame'
  })
  const edgeGuide = store.createProjectedStore({
    source: state,
    select: (next) => next.edge.guide ?? EMPTY_EDGE_GUIDE,
    isEqual: isEdgeGuideEqual,
    schedule: 'frame'
  })
  const mindmapPreview = store.createProjectedStore({
    source: state,
    select: (next) => next.mindmap.preview,
    isEqual: (left, right) => left === right,
    schedule: 'frame'
  })
  const snap = store.createProjectedStore({
    source: state,
    select: (next) => next.selection.guides.length > 0
      ? next.selection.guides
      : EMPTY_GUIDES,
    isEqual: (left: readonly Guide[], right: readonly Guide[]) => left === right,
    schedule: 'frame'
  })
  const marquee = store.createDerivedStore<MarqueePreview | undefined>({
    get: () => {
      const next = store.read(state).selection.marquee
      store.read(viewport)
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
