import type { Node } from '@whiteboard/core/types'

const EMPTY_NODES: Node[] = []

export const deriveVisibleNodes = (viewNodes: Node[]) => {
  if (!viewNodes.length) return EMPTY_NODES
  return viewNodes
}

export const deriveCanvasNodes = (visibleNodes: Node[]) =>
  visibleNodes.filter((node) => node.type !== 'mindmap')
