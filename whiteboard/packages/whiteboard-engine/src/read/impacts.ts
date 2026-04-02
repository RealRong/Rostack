import type { KernelReadImpact } from '@whiteboard/core/kernel'

const EMPTY_NODE_IMPACT = {
  ids: [],
  geometry: false,
  list: false,
  value: false
} as const

const EMPTY_EDGE_IMPACT = {
  ids: [],
  nodeIds: [],
  geometry: false,
  list: false,
  value: false
} as const

const EMPTY_MINDMAP_IMPACT = {
  ids: [],
  view: false
} as const

export const RESET_READ_IMPACT: KernelReadImpact = {
  reset: true,
  document: false,
  node: EMPTY_NODE_IMPACT,
  edge: EMPTY_EDGE_IMPACT,
  mindmap: EMPTY_MINDMAP_IMPACT
}

export const MINDMAP_LAYOUT_READ_IMPACT: KernelReadImpact = {
  reset: false,
  document: false,
  node: EMPTY_NODE_IMPACT,
  edge: EMPTY_EDGE_IMPACT,
  mindmap: {
    ids: [],
    view: true
  }
}
