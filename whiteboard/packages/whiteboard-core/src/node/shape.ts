import type {
  Node,
  SpatialNodeInput
} from '@whiteboard/core/types'
import {
  WHITEBOARD_SHAPE_DEFAULTS,
  WHITEBOARD_SHAPE_PRESET_PAINTS
} from '@whiteboard/core/palette'

export type ShapeKind =
  | 'rect'
  | 'rounded-rect'
  | 'pill'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'hexagon'
  | 'parallelogram'
  | 'cylinder'
  | 'document'
  | 'predefined-process'
  | 'callout'
  | 'cloud'
  | 'arrow-sticker'
  | 'highlight'

export type ShapeGroup = 'basic' | 'flowchart' | 'annotation'

export type ShapeLabelInset = {
  top: number | string
  right: number | string
  bottom: number | string
  left: number | string
}

export type ShapeSpec = {
  kind: ShapeKind
  label: string
  group: ShapeGroup
  defaultSize: {
    width: number
    height: number
  }
  defaultText: string
  defaults: {
    fill: string
    stroke: string
    color: string
  }
  previewFill?: string
  labelInset: ShapeLabelInset
}

export type ShapeControlId = 'fill' | 'stroke' | 'text'

export type ShapeMeta = {
  key: string
  name: string
  family: 'shape'
  icon: ShapeKind
  controls: readonly ShapeControlId[]
}

export type ShapeMenuSection = {
  key: ShapeGroup
  title: string
  items: readonly ShapeSpec[]
}

const SHAPE_KIND_SET = new Set<ShapeKind>([
  'rect',
  'rounded-rect',
  'pill',
  'ellipse',
  'diamond',
  'triangle',
  'hexagon',
  'parallelogram',
  'cylinder',
  'document',
  'predefined-process',
  'callout',
  'cloud',
  'arrow-sticker',
  'highlight'
])

const DEFAULT_SHAPE_KIND: ShapeKind = 'rect'
const DEFAULT_FILL = WHITEBOARD_SHAPE_DEFAULTS.fill
const DEFAULT_STROKE = WHITEBOARD_SHAPE_DEFAULTS.stroke
const DEFAULT_TEXT = WHITEBOARD_SHAPE_DEFAULTS.color
const SHAPE_META_CONTROLS = ['fill', 'stroke', 'text'] as const

export const isShapeKind = (
  value: string
): value is ShapeKind => SHAPE_KIND_SET.has(value as ShapeKind)

export const readShapeKind = (
  node: Pick<Node, 'data'>
): ShapeKind => {
  const value = typeof node.data?.kind === 'string'
    ? node.data.kind
    : undefined

  return value && isShapeKind(value)
    ? value
    : DEFAULT_SHAPE_KIND
}

export const SHAPE_SPECS: readonly ShapeSpec[] = [
  {
    kind: 'rect',
    label: 'Rectangle',
    group: 'basic',
    defaultSize: { width: 180, height: 100 },
    defaultText: 'Rectangle',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: 16,
      right: 16,
      bottom: 16,
      left: 16
    }
  },
  {
    kind: 'rounded-rect',
    label: 'Rounded',
    group: 'basic',
    defaultSize: { width: 180, height: 100 },
    defaultText: 'Rounded',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: 16,
      right: 18,
      bottom: 16,
      left: 18
    }
  },
  {
    kind: 'pill',
    label: 'Terminator',
    group: 'flowchart',
    defaultSize: { width: 200, height: 100 },
    defaultText: 'Start',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: 20,
      right: 28,
      bottom: 20,
      left: 28
    }
  },
  {
    kind: 'ellipse',
    label: 'Ellipse',
    group: 'basic',
    defaultSize: { width: 180, height: 110 },
    defaultText: 'Ellipse',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: '20%',
      right: '18%',
      bottom: '20%',
      left: '18%'
    }
  },
  {
    kind: 'diamond',
    label: 'Diamond',
    group: 'basic',
    defaultSize: { width: 180, height: 120 },
    defaultText: 'Decision',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: '22%',
      right: '24%',
      bottom: '22%',
      left: '24%'
    }
  },
  {
    kind: 'triangle',
    label: 'Triangle',
    group: 'basic',
    defaultSize: { width: 180, height: 130 },
    defaultText: 'Triangle',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: '34%',
      right: '20%',
      bottom: 18,
      left: '20%'
    }
  },
  {
    kind: 'hexagon',
    label: 'Hexagon',
    group: 'basic',
    defaultSize: { width: 190, height: 110 },
    defaultText: 'Hexagon',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: 16,
      right: '18%',
      bottom: 16,
      left: '18%'
    }
  },
  {
    kind: 'parallelogram',
    label: 'Data',
    group: 'flowchart',
    defaultSize: { width: 200, height: 110 },
    defaultText: 'Input / Output',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: '14%',
      right: '21%',
      bottom: '14%',
      left: '21%'
    }
  },
  {
    kind: 'cylinder',
    label: 'Database',
    group: 'flowchart',
    defaultSize: { width: 180, height: 130 },
    defaultText: 'Database',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: '20%',
      right: '16%',
      bottom: '18%',
      left: '16%'
    }
  },
  {
    kind: 'document',
    label: 'Document',
    group: 'flowchart',
    defaultSize: { width: 190, height: 130 },
    defaultText: 'Document',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: '12%',
      right: '12%',
      bottom: '22%',
      left: '12%'
    }
  },
  {
    kind: 'predefined-process',
    label: 'Subprocess',
    group: 'flowchart',
    defaultSize: { width: 210, height: 110 },
    defaultText: 'Subprocess',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: '14%',
      right: '22%',
      bottom: '14%',
      left: '22%'
    }
  },
  {
    kind: 'callout',
    label: 'Callout',
    group: 'annotation',
    defaultSize: { width: 240, height: 140 },
    defaultText: 'Callout',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: '12%',
      right: '12%',
      bottom: '24%',
      left: '12%'
    }
  },
  {
    kind: 'cloud',
    label: 'Cloud',
    group: 'annotation',
    defaultSize: { width: 220, height: 140 },
    defaultText: 'Cloud',
    defaults: {
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      color: DEFAULT_TEXT
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill,
    labelInset: {
      top: '22%',
      right: '16%',
      bottom: '18%',
      left: '16%'
    }
  },
  {
    kind: 'arrow-sticker',
    label: 'Arrow',
    group: 'annotation',
    defaultSize: { width: 220, height: 110 },
    defaultText: 'Arrow',
    defaults: {
      fill: WHITEBOARD_SHAPE_PRESET_PAINTS.arrowSticker.fill,
      stroke: WHITEBOARD_SHAPE_PRESET_PAINTS.arrowSticker.stroke,
      color: WHITEBOARD_SHAPE_PRESET_PAINTS.arrowSticker.color
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.arrowSticker.previewFill,
    labelInset: {
      top: '14%',
      right: '40%',
      bottom: '14%',
      left: '10%'
    }
  },
  {
    kind: 'highlight',
    label: 'Highlight',
    group: 'annotation',
    defaultSize: { width: 220, height: 90 },
    defaultText: 'Highlight',
    defaults: {
      fill: WHITEBOARD_SHAPE_PRESET_PAINTS.highlight.fill,
      stroke: WHITEBOARD_SHAPE_PRESET_PAINTS.highlight.stroke,
      color: WHITEBOARD_SHAPE_PRESET_PAINTS.highlight.color
    },
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.highlight.previewFill,
    labelInset: {
      top: '18%',
      right: '10%',
      bottom: '18%',
      left: '10%'
    }
  }
] as const

const SHAPE_SPEC_BY_KIND = new Map(
  SHAPE_SPECS.map((spec) => [spec.kind, spec] as const)
)

export const readShapeSpec = (
  kind: ShapeKind | undefined
): ShapeSpec => SHAPE_SPEC_BY_KIND.get(kind ?? DEFAULT_SHAPE_KIND) ?? SHAPE_SPEC_BY_KIND.get(DEFAULT_SHAPE_KIND)!

export const readShapeMeta = (
  node: Pick<Node, 'data'>
): ShapeMeta => {
  const spec = readShapeSpec(readShapeKind(node))

  return {
    key: `shape:${spec.kind}`,
    name: spec.label,
    family: 'shape',
    icon: spec.kind,
    controls: SHAPE_META_CONTROLS
  }
}

export const createShapeNodeInput = (
  kind: ShapeKind
): Omit<SpatialNodeInput, 'position'> => {
  const spec = readShapeSpec(kind)

  return {
    type: 'shape',
    size: { ...spec.defaultSize },
    data: {
      kind,
      text: spec.defaultText
    },
    style: {
      fill: spec.defaults.fill,
      stroke: spec.defaults.stroke,
      strokeWidth: 1,
      color: spec.defaults.color
    }
  }
}

export const SHAPE_MENU_SECTIONS: readonly ShapeMenuSection[] = [
  {
    key: 'basic',
    title: 'Basic',
    items: SHAPE_SPECS.filter((spec) => spec.group === 'basic')
  },
  {
    key: 'flowchart',
    title: 'Flowchart',
    items: SHAPE_SPECS.filter((spec) => spec.group === 'flowchart')
  },
  {
    key: 'annotation',
    title: 'Annotation',
    items: SHAPE_SPECS.filter((spec) => spec.group === 'annotation')
  }
] as const

export const readShapePreviewFill = (
  kind: ShapeKind
): string => readShapeSpec(kind).previewFill ?? WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill
