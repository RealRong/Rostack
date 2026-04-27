import type {
  MindmapCommandOptions,
  MindmapInsertPayload,
  MindmapInsertInput,
  MindmapNodeId,
  MindmapStructure,
  MindmapTopicData,
  NodeStyle,
  NodeUpdateInput,
  Point,
  Rect
} from '@whiteboard/core/types'
import type {
  MindmapInsertPlacement
} from '@whiteboard/core/types/mindmap'
import type {
  MindmapLayoutSpec,
  MindmapMoveSubtreeInput,
  MindmapTree
} from '@whiteboard/core/mindmap/types'
import {
  resolveInsertPlan
} from '@whiteboard/core/mindmap/tree'

export const DEFAULT_ROOT_MOVE_THRESHOLD = 0.5

const DEFAULT_MINDMAP_SIDE: 'left' | 'right' = 'right'
const MINDMAP_ADD_BUTTON_OFFSET = 12

const readAddButtonY = (
  rect: Rect
) => rect.y + Math.max(rect.height / 2 - 14, 0)

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

export const addChildTargets = (input: {
  structure: MindmapStructure
  nodeId: MindmapNodeId
  rect: Rect
}): readonly {
  targetNodeId: MindmapNodeId
  x: number
  y: number
  placement: 'left' | 'right'
}[] => {
  if (input.nodeId === input.structure.rootId) {
    return [
      {
        targetNodeId: input.nodeId,
        x: input.rect.x - 28 - MINDMAP_ADD_BUTTON_OFFSET,
        y: readAddButtonY(input.rect),
        placement: 'left'
      },
      {
        targetNodeId: input.nodeId,
        x: input.rect.x + input.rect.width + MINDMAP_ADD_BUTTON_OFFSET,
        y: readAddButtonY(input.rect),
        placement: 'right'
      }
    ]
  }

  const side = input.structure.tree.nodes[input.nodeId]?.side ?? 'right'
  return [{
    targetNodeId: input.nodeId,
    x: side === 'left'
      ? input.rect.x - 28 - MINDMAP_ADD_BUTTON_OFFSET
      : input.rect.x + input.rect.width + MINDMAP_ADD_BUTTON_OFFSET,
    y: readAddButtonY(input.rect),
    placement: side === 'left' ? 'left' : 'right'
  }]
}

export const insertSide = (input: {
  structure: MindmapStructure
  targetNodeId: MindmapNodeId
  side?: 'left' | 'right'
}): 'left' | 'right' => {
  if (input.side) {
    return input.side
  }

  const targetSide = input.structure.tree.nodes[input.targetNodeId]?.side
  if (targetSide === 'left' || targetSide === 'right') {
    return targetSide
  }

  return input.structure.tree.layout.side === 'left'
    ? 'left'
    : 'right'
}

export const relativeInsertInput = (input: {
  structure: MindmapStructure
  targetNodeId: MindmapNodeId
  relation: 'child' | 'sibling' | 'parent'
  side?: 'left' | 'right'
  payload?: MindmapTopicData
}): MindmapInsertInput | undefined => {
  const anchorLayout = {
    ...input.structure.tree.layout,
    anchorId: input.targetNodeId
  }
  const isRoot = input.targetNodeId === input.structure.rootId
  const target = input.structure.tree.nodes[input.targetNodeId]

  if (!isRoot && !target) {
    return undefined
  }

  switch (input.relation) {
    case 'child':
      return {
        kind: 'child',
        parentId: input.targetNodeId,
        payload: input.payload,
        options: {
          side: insertSide({
            structure: input.structure,
            targetNodeId: input.targetNodeId,
            side: input.side
          }),
          layout: anchorLayout
        }
      }
    case 'sibling':
      if (isRoot) {
        return {
          kind: 'child',
          parentId: input.targetNodeId,
          payload: input.payload,
          options: {
            side: insertSide({
              structure: input.structure,
              targetNodeId: input.targetNodeId,
              side: input.side
            }),
            layout: anchorLayout
          }
        }
      }

      return {
        kind: 'sibling',
        nodeId: input.targetNodeId,
        position: 'after',
        payload: input.payload,
        options: {
          layout: anchorLayout
        }
      }
    case 'parent':
      if (isRoot) {
        return undefined
      }

      return {
        kind: 'parent',
        nodeId: input.targetNodeId,
        payload: input.payload,
        options: {
          side: insertSide({
            structure: input.structure,
            targetNodeId: input.targetNodeId,
            side: input.side
          }),
          layout: anchorLayout
        }
      }
  }
}

export const insertByPlacement = ({
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

export const subtreeMove = ({
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

export const rootMove = ({
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

export const topicStylePatch = (input: {
  frameKind?: string
  fill?: string
  stroke?: string
  strokeWidth?: number
}): Partial<NodeStyle> => Object.fromEntries(
  Object.entries({
    frameKind: input.frameKind,
    fill: input.fill,
    stroke: input.stroke,
    strokeWidth: input.strokeWidth
  }).filter(([, value]) => value !== undefined)
) as Partial<NodeStyle>

export const planMindmapInsertByPlacement = insertByPlacement
export const planMindmapSubtreeMove = subtreeMove
export const planMindmapRootMove = rootMove
export const readMindmapAddChildTargets = addChildTargets
export const resolveMindmapInsertSide = insertSide
export const buildMindmapRelativeInsertInput = relativeInsertInput
export const toMindmapTopicStylePatch = topicStylePatch
