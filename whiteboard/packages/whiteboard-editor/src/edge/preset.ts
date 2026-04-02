import type { EdgeType } from '@whiteboard/core/types'
import type { EdgePresetKey } from '../types/tool'

const EDGE_PRESET_TO_TYPE = {
  'edge.straight': 'linear',
  'edge.elbow': 'step',
  'edge.curve': 'curve'
} as const satisfies Record<EdgePresetKey, EdgeType>

export const readEdgeType = (
  preset: EdgePresetKey
): EdgeType => EDGE_PRESET_TO_TYPE[preset]
