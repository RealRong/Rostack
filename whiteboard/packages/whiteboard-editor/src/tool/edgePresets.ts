import type { EdgeInput } from '@whiteboard/core/types'
import type { EdgePresetKey } from '@whiteboard/editor/types/tool'

export type EdgePresetCreate = Pick<EdgeInput, 'type' | 'style'>

export const EDGE_PRESET_KEYS = [
  'edge.line',
  'edge.arrow',
  'edge.elbow-arrow',
  'edge.fillet-arrow',
  'edge.curve-arrow'
] as const satisfies readonly EdgePresetKey[]

export const DEFAULT_EDGE_PRESET_KEY: EdgePresetKey = 'edge.arrow'

const EDGE_PRESET_CREATE: Record<EdgePresetKey, EdgePresetCreate> = {
  'edge.line': {
    type: 'straight'
  },
  'edge.arrow': {
    type: 'straight',
    style: {
      end: 'arrow'
    }
  },
  'edge.elbow-arrow': {
    type: 'elbow',
    style: {
      end: 'arrow'
    }
  },
  'edge.fillet-arrow': {
    type: 'fillet',
    style: {
      end: 'arrow'
    }
  },
  'edge.curve-arrow': {
    type: 'curve',
    style: {
      end: 'arrow'
    }
  }
}

export const readEdgePresetCreate = (
  preset: EdgePresetKey
): EdgePresetCreate => {
  const create = EDGE_PRESET_CREATE[preset]

  return {
    type: create.type,
    ...(create.style
      ? {
          style: {
            ...create.style
          }
        }
      : {})
  }
}
