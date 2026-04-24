import type {
  MindmapCommandOptions,
  MindmapInsertPayload,
  NodeUpdateInput,
  Point
} from '@whiteboard/core/types'
import type {
  MindmapInsertPlacement
} from '@whiteboard/core/types/mindmap'
import type {
  MindmapInsertInput,
  MindmapLayoutSpec,
  MindmapMoveSubtreeInput,
  MindmapNodeId,
  MindmapTopicData,
  MindmapTree
} from '@whiteboard/core/mindmap/types'
import {
  resolveInsertPlan
} from '@whiteboard/core/mindmap/tree'

export const DEFAULT_ROOT_MOVE_THRESHOLD = 0.5

const DEFAULT_MINDMAP_SIDE: 'left' | 'right' = 'right'

const createLayoutHint = ({
  anchorId,
  layout
}: {
  anchorId: MindmapNodeId
  layout: MindmapLayoutSpec
}): MindmapCommandOptions['layout'] => ({
  ...layout,
  anchorId
})

export const planMindmapInsertByPlacement = ({
  tree,
  targetNodeId,
  placement,
  layout,
  payload
}: {
  tree: MindmapTree
  targetNodeId: MindmapNodeId
  placement: MindmapInsertPlacement
  layout: MindmapLayoutSpec
  payload?: MindmapTopicData | MindmapInsertPayload
}): MindmapInsertInput & {
  options?: MindmapCommandOptions | Pick<MindmapCommandOptions, 'side' | 'layout'>
} => {
  const normalizedPayload: MindmapTopicData | MindmapInsertPayload = payload ?? {
    kind: 'text',
    text: ''
  }
  const plan = resolveInsertPlan({
    tree,
    targetNodeId,
    placement,
    layoutSide: layout.side,
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
        layout
      })
    }
  }
}

export const planMindmapSubtreeMove = ({
  nodeId,
  drop,
  origin,
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
  layout: MindmapLayoutSpec
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
