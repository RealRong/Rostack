import type { NodeTemplate, Node } from '@whiteboard/core/types'
import {
  isShapeKind,
  readShapeKind,
  type ShapeKind
} from '@whiteboard/core/node'
import {
  WHITEBOARD_SHAPE_DEFAULTS,
  WHITEBOARD_SHAPE_PRESET_PAINTS
} from '@whiteboard/product/palette/defaults'

export type WhiteboardShapeGroup = 'basic' | 'flowchart' | 'annotation'
export type WhiteboardShapeControlId = 'fill' | 'stroke' | 'text'

export type WhiteboardShapeSpec = {
  kind: ShapeKind
  label: string
  group: WhiteboardShapeGroup
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
  previewFill: string
}

export type WhiteboardShapeMeta = {
  key: string
  name: string
  family: 'shape'
  icon: ShapeKind
  controls: readonly WhiteboardShapeControlId[]
}

export type WhiteboardShapeMenuSection = {
  key: WhiteboardShapeGroup
  title: string
  items: readonly WhiteboardShapeSpec[]
}

const WHITEBOARD_SHAPE_CONTROLS = ['fill', 'stroke', 'text'] as const satisfies readonly WhiteboardShapeControlId[]

const createShapeSpec = (
  input: Omit<WhiteboardShapeSpec, 'defaults' | 'previewFill'> & {
    defaults?: WhiteboardShapeSpec['defaults']
    previewFill?: string
  }
): WhiteboardShapeSpec => ({
  ...input,
  defaults: input.defaults ?? WHITEBOARD_SHAPE_DEFAULTS,
  previewFill: input.previewFill ?? WHITEBOARD_SHAPE_PRESET_PAINTS.default.previewFill
})

export const WHITEBOARD_SHAPE_SPECS: readonly WhiteboardShapeSpec[] = [
  createShapeSpec({ kind: 'rect', label: 'Rectangle', group: 'basic', defaultSize: { width: 180, height: 100 }, defaultText: 'Rectangle' }),
  createShapeSpec({ kind: 'rounded-rect', label: 'Rounded', group: 'basic', defaultSize: { width: 180, height: 100 }, defaultText: 'Rounded' }),
  createShapeSpec({ kind: 'pill', label: 'Terminator', group: 'flowchart', defaultSize: { width: 200, height: 100 }, defaultText: 'Start' }),
  createShapeSpec({ kind: 'ellipse', label: 'Ellipse', group: 'basic', defaultSize: { width: 180, height: 110 }, defaultText: 'Ellipse' }),
  createShapeSpec({ kind: 'diamond', label: 'Diamond', group: 'basic', defaultSize: { width: 180, height: 120 }, defaultText: 'Decision' }),
  createShapeSpec({ kind: 'triangle', label: 'Triangle', group: 'basic', defaultSize: { width: 180, height: 130 }, defaultText: 'Triangle' }),
  createShapeSpec({ kind: 'hexagon', label: 'Hexagon', group: 'basic', defaultSize: { width: 190, height: 110 }, defaultText: 'Hexagon' }),
  createShapeSpec({ kind: 'parallelogram', label: 'Data', group: 'flowchart', defaultSize: { width: 200, height: 110 }, defaultText: 'Input / Output' }),
  createShapeSpec({ kind: 'star', label: 'Star', group: 'basic', defaultSize: { width: 190, height: 180 }, defaultText: 'Star' }),
  createShapeSpec({ kind: 'pentagon', label: 'Pentagon', group: 'basic', defaultSize: { width: 180, height: 140 }, defaultText: 'Pentagon' }),
  createShapeSpec({ kind: 'trapezoid', label: 'Trapezoid', group: 'basic', defaultSize: { width: 190, height: 130 }, defaultText: 'Trapezoid' }),
  createShapeSpec({ kind: 'semicircle', label: 'Semicircle', group: 'basic', defaultSize: { width: 190, height: 120 }, defaultText: 'Semicircle' }),
  createShapeSpec({ kind: 'cylinder', label: 'Database', group: 'flowchart', defaultSize: { width: 180, height: 130 }, defaultText: 'Database' }),
  createShapeSpec({ kind: 'document', label: 'Document', group: 'flowchart', defaultSize: { width: 190, height: 130 }, defaultText: 'Document' }),
  createShapeSpec({ kind: 'predefined-process', label: 'Subprocess', group: 'flowchart', defaultSize: { width: 210, height: 110 }, defaultText: 'Subprocess' }),
  createShapeSpec({ kind: 'bevel-rect', label: 'Bevel', group: 'flowchart', defaultSize: { width: 190, height: 110 }, defaultText: 'Process' }),
  createShapeSpec({ kind: 'delay', label: 'Delay', group: 'flowchart', defaultSize: { width: 190, height: 110 }, defaultText: 'Delay' }),
  createShapeSpec({ kind: 'manual-input', label: 'Manual Input', group: 'flowchart', defaultSize: { width: 200, height: 120 }, defaultText: 'Manual Input' }),
  createShapeSpec({ kind: 'manual-operation', label: 'Manual Operation', group: 'flowchart', defaultSize: { width: 200, height: 120 }, defaultText: 'Manual Operation' }),
  createShapeSpec({ kind: 'callout', label: 'Callout', group: 'annotation', defaultSize: { width: 240, height: 140 }, defaultText: 'Callout' }),
  createShapeSpec({ kind: 'roundrect-bubble', label: 'Speech Bubble', group: 'annotation', defaultSize: { width: 240, height: 150 }, defaultText: 'Speech Bubble' }),
  createShapeSpec({ kind: 'ellipse-bubble', label: 'Ellipse Bubble', group: 'annotation', defaultSize: { width: 240, height: 160 }, defaultText: 'Ellipse Bubble' }),
  createShapeSpec({ kind: 'cloud', label: 'Cloud', group: 'annotation', defaultSize: { width: 220, height: 140 }, defaultText: 'Cloud' }),
  createShapeSpec({
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
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.arrowSticker.previewFill
  }),
  createShapeSpec({
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
    previewFill: WHITEBOARD_SHAPE_PRESET_PAINTS.highlight.previewFill
  })
] as const

const WHITEBOARD_SHAPE_SPEC_BY_KIND = new Map(
  WHITEBOARD_SHAPE_SPECS.map((spec) => [spec.kind, spec] as const)
)

export const getWhiteboardShapeSpec = (
  kind: ShapeKind | undefined
): WhiteboardShapeSpec => WHITEBOARD_SHAPE_SPEC_BY_KIND.get(kind ?? 'rect') ?? WHITEBOARD_SHAPE_SPEC_BY_KIND.get('rect')!

export const readWhiteboardShapeMeta = (
  node: Pick<Node, 'data'>
): WhiteboardShapeMeta => {
  const spec = getWhiteboardShapeSpec(readShapeKind(node))

  return {
    key: `shape:${spec.kind}`,
    name: spec.label,
    family: 'shape',
    icon: spec.kind,
    controls: WHITEBOARD_SHAPE_CONTROLS
  }
}

export const createWhiteboardShapeTemplate = (
  kind: ShapeKind
): NodeTemplate => {
  const spec = getWhiteboardShapeSpec(kind)

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

export const WHITEBOARD_SHAPE_MENU_SECTIONS: readonly WhiteboardShapeMenuSection[] = [
  {
    key: 'basic',
    title: 'Basic',
    items: WHITEBOARD_SHAPE_SPECS.filter((spec) => spec.group === 'basic')
  },
  {
    key: 'flowchart',
    title: 'Flowchart',
    items: WHITEBOARD_SHAPE_SPECS.filter((spec) => spec.group === 'flowchart')
  },
  {
    key: 'annotation',
    title: 'Annotation',
    items: WHITEBOARD_SHAPE_SPECS.filter((spec) => spec.group === 'annotation')
  }
] as const

export const readWhiteboardShapePreviewFill = (
  kind: ShapeKind
): string => getWhiteboardShapeSpec(kind).previewFill

export {
  isShapeKind
}
