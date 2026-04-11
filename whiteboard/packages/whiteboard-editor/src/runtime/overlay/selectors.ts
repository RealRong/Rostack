import {
  createDerivedStore,
  createProjectedKeyedStore,
  createProjectedStore,
  type ReadStore
} from '@shared/core'
import type { Guide } from '@whiteboard/core/node'
import type { EditorViewportRuntime } from '../editor/types'
import {
  EMPTY_EDGE_GUIDE,
  EMPTY_EDGE_OVERLAY_PROJECTION,
  isEdgeGuideEqual,
  isEdgeProjectionEqual,
  toEdgeOverlayMap
} from './edge'
import {
  EMPTY_NODE_OVERLAY_PROJECTION,
  isNodeProjectionEqual,
  toNodeOverlayMap
} from './node'
import {
  EMPTY_GUIDES,
  isMarqueeFeedbackEqual,
  projectWorldRect
} from './selection'
import type {
  EditorOverlay,
  EditorOverlayState,
  MarqueeFeedback
} from './types'

export const createOverlaySelectors = ({
  state,
  viewport
}: {
  state: ReadStore<EditorOverlayState>
  viewport: EditorViewportRuntime['read']
}): EditorOverlay['selectors'] => {
  const node = createProjectedKeyedStore({
    source: state,
    select: toNodeOverlayMap,
    emptyValue: EMPTY_NODE_OVERLAY_PROJECTION,
    isEqual: isNodeProjectionEqual,
    schedule: 'microtask'
  })
  const edge = createProjectedKeyedStore({
    source: state,
    select: toEdgeOverlayMap,
    emptyValue: EMPTY_EDGE_OVERLAY_PROJECTION,
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
  const mindmapDrag = createProjectedStore({
    source: state,
    select: (next) => next.mindmap.drag,
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
  const marquee = createDerivedStore<MarqueeFeedback | undefined>({
    get: (read) => {
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
    feedback: {
      draw,
      marquee,
      mindmapDrag,
      edgeGuide,
      snap
    }
  }
}
