import type {
  EdgeDash,
  EdgeTextMode,
  NodeModel,
  NodeTemplate,
  Rect
} from '@whiteboard/core/types'

export type EditorNodePaintDefaults = {
  fill?: string
  stroke?: string
  strokeWidth?: number
  color?: string
}

export type EditorEdgeDefaults = {
  color: string
  width: number
  dash: EdgeDash
  textMode: EdgeTextMode
}

export type EditorDefaults = {
  selection: {
    node: {
      readPaint: (node: NodeModel) => EditorNodePaintDefaults | undefined
    }
    edge: EditorEdgeDefaults
  }
  templates: {
    frame: (input: {
      bounds: Rect
      padding: number
    }) => NodeTemplate
  }
}

const DEFAULT_TEXT_COLOR = 'var(--ui-text-primary)'
const DEFAULT_SURFACE_FILL = 'var(--ui-surface)'
const DEFAULT_BORDER_COLOR = 'var(--ui-border-secondary)'
const DEFAULT_MUTED_TEXT_COLOR = 'var(--ui-text-secondary)'
const DEFAULT_STICKY_FILL = 'var(--ui-surface-warning)'

export const DEFAULT_EDITOR_DEFAULTS: EditorDefaults = {
  selection: {
    node: {
      readPaint: (node) => {
        if (node.type === 'text') {
          return {
            color: DEFAULT_TEXT_COLOR
          }
        }

        if (node.type === 'draw') {
          return {
            stroke: DEFAULT_TEXT_COLOR,
            strokeWidth: 2
          }
        }

        if (node.type === 'frame') {
          return {
            fill: 'transparent',
            stroke: DEFAULT_BORDER_COLOR,
            strokeWidth: 1,
            color: DEFAULT_MUTED_TEXT_COLOR
          }
        }

        if (node.type === 'sticky') {
          return {
            fill: DEFAULT_STICKY_FILL,
            stroke: DEFAULT_BORDER_COLOR,
            strokeWidth: 1,
            color: DEFAULT_TEXT_COLOR
          }
        }

        if (node.type === 'shape') {
          return {
            fill: DEFAULT_SURFACE_FILL,
            stroke: DEFAULT_BORDER_COLOR,
            strokeWidth: 1,
            color: DEFAULT_TEXT_COLOR
          }
        }

        return undefined
      }
    },
    edge: {
      color: DEFAULT_TEXT_COLOR,
      width: 2,
      dash: 'solid',
      textMode: 'horizontal'
    }
  },
  templates: {
    frame: ({
      bounds,
      padding
    }) => ({
      type: 'frame',
      size: {
        width: bounds.width + padding * 2,
        height: bounds.height + padding * 2
      },
      data: {
        title: 'Frame'
      },
      style: {
        fill: 'transparent',
        stroke: DEFAULT_BORDER_COLOR,
        strokeWidth: 1,
        color: DEFAULT_MUTED_TEXT_COLOR
      }
    })
  }
}
