import type { Token } from '@shared/i18n'
import type { EdgeTemplate } from '@whiteboard/core/types'
import {
  whiteboardEdgePresetLabelToken
} from '@whiteboard/product/i18n/tokens'

export type WhiteboardEdgePresetKey = string

export type WhiteboardEdgePreset = {
  key: WhiteboardEdgePresetKey
  label: string
  labelToken: Token
  template: EdgeTemplate
}

const WHITEBOARD_EDGE_PRESET_TEMPLATES: Record<WhiteboardEdgePresetKey, EdgeTemplate> = {
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

const WHITEBOARD_EDGE_PRESET_LABELS: Record<WhiteboardEdgePresetKey, string> = {
  'edge.line': 'Line',
  'edge.arrow': 'Arrow',
  'edge.elbow-arrow': 'Elbow',
  'edge.fillet-arrow': 'Fillet',
  'edge.curve-arrow': 'Curve'
}

export const WHITEBOARD_EDGE_PRESET_KEYS = Object.keys(
  WHITEBOARD_EDGE_PRESET_TEMPLATES
) as readonly WhiteboardEdgePresetKey[]

export const DEFAULT_WHITEBOARD_EDGE_PRESET_KEY: WhiteboardEdgePresetKey = 'edge.arrow'

export const resolveWhiteboardEdgeTemplate = (
  preset: string
): EdgeTemplate | undefined => {
  const template = WHITEBOARD_EDGE_PRESET_TEMPLATES[preset]
  if (!template) {
    return undefined
  }

  return {
    type: template.type,
    ...(template.style
      ? {
          style: {
            ...template.style
          }
        }
      : {}),
    ...(template.textMode
      ? {
          textMode: template.textMode
        }
      : {})
  }
}

export const getWhiteboardEdgePreset = (
  preset: string
): WhiteboardEdgePreset | undefined => {
  const template = resolveWhiteboardEdgeTemplate(preset)
  if (!template) {
    return undefined
  }

  return {
    key: preset,
    label: WHITEBOARD_EDGE_PRESET_LABELS[preset] ?? preset,
    labelToken: whiteboardEdgePresetLabelToken(
      preset,
      WHITEBOARD_EDGE_PRESET_LABELS[preset] ?? preset
    ),
    template
  }
}

export const WHITEBOARD_EDGE_PRESETS: readonly WhiteboardEdgePreset[] =
  WHITEBOARD_EDGE_PRESET_KEYS
    .map((key) => getWhiteboardEdgePreset(key))
    .filter((preset): preset is WhiteboardEdgePreset => preset !== undefined)
