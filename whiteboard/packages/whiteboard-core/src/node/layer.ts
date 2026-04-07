import type { Node, NodeId } from '../types'

export const toLayerOrderedCanvasNodes = (nodes: Node[]) => {
  const background: Node[] = []
  const normal: Node[] = []
  const overlay: Node[] = []

  nodes.forEach((node) => {
    const layer = node.layer ?? 'default'
    if (layer === 'background') {
      background.push(node)
      return
    }
    if (layer === 'overlay') {
      overlay.push(node)
      return
    }
    normal.push(node)
  })

  return [...background, ...normal, ...overlay]
}

export const toLayerOrderedCanvasNodeIds = (nodes: Node[]): NodeId[] => {
  const background: NodeId[] = []
  const normal: NodeId[] = []
  const overlay: NodeId[] = []

  nodes.forEach((node) => {
    const layer = node.layer ?? 'default'
    if (layer === 'background') {
      background.push(node.id)
      return
    }
    if (layer === 'overlay') {
      overlay.push(node.id)
      return
    }
    normal.push(node.id)
  })

  return [...background, ...normal, ...overlay]
}
