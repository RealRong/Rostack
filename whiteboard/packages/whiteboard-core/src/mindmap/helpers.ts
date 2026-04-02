import type { Document, MindmapId, Node } from '../types/core'
import { getNode } from '../types/core'
import type { MindmapTree } from './types'

const isMindmapTree = (value: unknown): value is MindmapTree => {
  if (!value || typeof value !== 'object') return false
  const tree = value as MindmapTree
  return typeof tree.rootId === 'string' && typeof tree.nodes === 'object' && typeof tree.children === 'object'
}

export const getMindmapTreeFromNode = (node: Node | undefined): MindmapTree | undefined => {
  if (!node || node.type !== 'mindmap') return
  const data = node.data as Record<string, unknown> | undefined
  if (!data || typeof data !== 'object') return
  const tree = data.mindmap
  return isMindmapTree(tree) ? tree : undefined
}

const getMindmapNodeById = (
  document: Pick<Document, 'nodes'>,
  id: MindmapId
): Node | undefined => {
  const node = getNode(document, id)
  return node?.type === 'mindmap' ? node : undefined
}

export const getMindmapTreeFromDocument = (
  document: Pick<Document, 'nodes'>,
  id: MindmapId
): MindmapTree | undefined => getMindmapTreeFromNode(getMindmapNodeById(document, id))
