import type { Invalidation } from '@whiteboard/core/types'

export const RESET_INVALIDATION: Invalidation = {
  document: true,
  background: true,
  canvasOrder: true,
  nodes: new Set(),
  edges: new Set(),
  groups: new Set(),
  mindmaps: new Set(),
  projections: new Set([
    'node',
    'edge',
    'mindmap'
  ])
}
