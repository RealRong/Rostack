import type {
  MindmapInsertInput,
  MindmapNodeId,
  MindmapStructure,
  MindmapTopicData,
  NodeStyle,
  Rect
} from '@whiteboard/core/types'

const MINDMAP_ADD_BUTTON_OFFSET = 12

const readAddButtonY = (
  rect: Rect
) => rect.y + Math.max(rect.height / 2 - 14, 0)

export const readMindmapAddChildTargets = (input: {
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

export const resolveMindmapInsertSide = (input: {
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

export const buildMindmapRelativeInsertInput = (input: {
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
          side: resolveMindmapInsertSide({
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
            side: resolveMindmapInsertSide({
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
          side: resolveMindmapInsertSide({
            structure: input.structure,
            targetNodeId: input.targetNodeId,
            side: input.side
          }),
          layout: anchorLayout
        }
      }
  }
}

export const toMindmapTopicStylePatch = (input: {
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
