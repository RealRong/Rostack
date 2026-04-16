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

export const RESET_READ_IMPACT: KernelReadImpact = {
  reset: true,
  document: false,
  node: EMPTY_NODE_IMPACT,
  edge: EMPTY_EDGE_IMPACT
}
