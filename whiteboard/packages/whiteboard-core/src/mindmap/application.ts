import type {
  MindmapCommandOptions,
  MindmapInsertPayload,
  NodeUpdateInput,
  Point,
  Size
} from '../types'
import type {
  MindmapInsertPlacement
} from '../types/mindmap'
import type {
  MindmapInsertInput,
  MindmapLayoutConfig,
  MindmapMoveSubtreeInput,
  MindmapNodeData,
  MindmapNodeId,
  MindmapTree
} from './types'
import {
  resolveInsertPlan
} from './query'

export const DEFAULT_ROOT_MOVE_THRESHOLD = 0.5

const DEFAULT_MINDMAP_SIDE: 'left' | 'right' = 'right'

const createLayoutHint = ({
  anchorId,
  nodeSize,
  layout
}: {
  anchorId: MindmapNodeId
  nodeSize: Size
  layout: MindmapLayoutConfig
}): MindmapCommandOptions['layout'] => ({
  nodeSize,
  mode: layout.mode,
  options: layout.options,
  anchorId
})

export const planMindmapInsertByPlacement = ({
  tree,
  targetNodeId,
  placement,
  nodeSize,
  layout,
  payload
}: {
  tree: MindmapTree
  targetNodeId: MindmapNodeId
  placement: MindmapInsertPlacement
  nodeSize: Size
  layout: MindmapLayoutConfig
  payload?: MindmapNodeData | MindmapInsertPayload
}): MindmapInsertInput & {
  options?: MindmapCommandOptions | Pick<MindmapCommandOptions, 'side' | 'layout'>
} => {
  const normalizedPayload: MindmapNodeData | MindmapInsertPayload = payload ?? {
    kind: 'text',
    text: ''
  }
  const plan = resolveInsertPlan({
    tree,
    targetNodeId,
    placement,
    layoutSide: layout.options?.side,
    defaultSide: DEFAULT_MINDMAP_SIDE
  })

  if (plan.mode === 'child') {
    return {
      kind: 'child',
      parentId: plan.parentId,
      payload: normalizedPayload,
      options: {
        index: plan.index,
        side: plan.side,
        layout: createLayoutHint({
          anchorId: targetNodeId,
          nodeSize,
          layout
        })
      }
    }
  }

  if (plan.mode === 'sibling') {
    return {
      kind: 'sibling',
      nodeId: plan.nodeId,
      position: plan.position,
      payload: normalizedPayload,
      options: {
        layout: createLayoutHint({
          anchorId: targetNodeId,
          nodeSize,
          layout
        })
      }
    }
  }

  return {
    kind: 'parent',
    nodeId: plan.nodeId,
    payload: normalizedPayload,
    options: {
      layout: createLayoutHint({
        anchorId: targetNodeId,
        nodeSize,
        layout
      })
    }
  }
}

export const planMindmapSubtreeMove = ({
  nodeId,
  drop,
  origin,
  nodeSize,
  layout
}: {
  nodeId: MindmapNodeId
  drop: {
    parentId: MindmapNodeId
    index: number
    side?: 'left' | 'right'
  }
  origin?: {
    parentId?: MindmapNodeId
    index?: number
  }
  nodeSize: Size
  layout: MindmapLayoutConfig
}): (MindmapMoveSubtreeInput & {
  layout: MindmapCommandOptions['layout']
}) | undefined => {
  const shouldMove = (
    drop.parentId !== origin?.parentId
    || drop.index !== origin?.index
    || typeof drop.side !== 'undefined'
  )
  if (!shouldMove) {
    return undefined
  }

  return {
    nodeId,
    parentId: drop.parentId,
    index: drop.index,
    side: drop.side,
    layout: createLayoutHint({
      anchorId: drop.parentId,
      nodeSize,
      layout
    })
  }
}

export const planMindmapRootMove = ({
  position,
  origin,
  threshold = DEFAULT_ROOT_MOVE_THRESHOLD
}: {
  position: Point
  origin?: Point
  threshold?: number
}): NodeUpdateInput | undefined => {
  const shouldMove = !origin
    || Math.abs(origin.x - position.x) >= threshold
    || Math.abs(origin.y - position.y) >= threshold
  if (!shouldMove) {
    return undefined
  }

  return {
    fields: {
      position: {
        x: position.x,
        y: position.y
      }
    }
  }
}
