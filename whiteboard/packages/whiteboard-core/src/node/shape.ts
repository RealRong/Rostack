import type {
  Node,
  Point,
  SpatialNodeInput
} from '@whiteboard/core/types'

export type ShapeKind =
  | 'rect'
  | 'rounded-rect'
  | 'pill'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'hexagon'
  | 'parallelogram'
  | 'star'
  | 'pentagon'
  | 'trapezoid'
  | 'semicircle'
  | 'cylinder'
  | 'document'
  | 'predefined-process'
  | 'bevel-rect'
  | 'delay'
  | 'manual-input'
  | 'manual-operation'
  | 'callout'
  | 'roundrect-bubble'
  | 'ellipse-bubble'
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

export type ShapeOutlineSide = 'top' | 'right' | 'bottom' | 'left'

export type ShapeOutlineSpec = Record<ShapeOutlineSide, readonly Point[]>

export type ShapePathSpec = {
  d: string
  fill?: 'inherit' | 'none'
  stroke?: 'inherit' | 'none'
  fillRule?: 'evenodd' | 'nonzero'
  strokeLinecap?: 'round' | 'butt'
  strokeLinejoin?: 'round' | 'miter'
  strokeWidthAdjust?: number
  strokeWidthMin?: number
}

export type ShapeVisualSpec = {
  outer: ShapePathSpec
  decorations?: readonly ShapePathSpec[]
}

export type ShapeDescriptor = ShapeSpec & {
  outline: ShapeOutlineSpec
  visual: ShapeVisualSpec
}

const DEFAULT_SHAPE_KIND: ShapeKind = 'rect'
const DEFAULT_FILL = 'var(--wb-palette-bg-7)'
const DEFAULT_STROKE = 'var(--wb-palette-border-0)'
const DEFAULT_TEXT = 'var(--wb-palette-text-0)'
const DEFAULT_PREVIEW_FILL = 'var(--wb-color-bg-7)'
const ARROW_STICKER_PAINT = {
  fill: 'var(--wb-palette-bg-25)',
  stroke: 'var(--wb-palette-border-26)',
  color: 'var(--wb-palette-border-26)',
  previewFill: 'var(--wb-color-bg-25)'
} as const
const HIGHLIGHT_PAINT = {
  fill: 'var(--wb-palette-bg-22)',
  stroke: 'var(--wb-palette-border-23)',
  color: 'var(--wb-palette-text-0)',
  previewFill: 'var(--wb-color-bg-12)'
} as const
const SHAPE_META_CONTROLS = ['fill', 'stroke', 'text'] as const
const OUTLINE_VIEWBOX = 100
const CURVE_SEGMENTS = 12

const point100 = (
  x: number,
  y: number
): Point => ({
  x: x / OUTLINE_VIEWBOX,
  y: y / OUTLINE_VIEWBOX
})

const polyline100 = (
  ...values: ReadonlyArray<readonly [number, number]>
): Point[] => values.map(([x, y]) => point100(x, y))

const joinPolyline = (
  ...segments: ReadonlyArray<readonly Point[]>
): Point[] => {
  const joined: Point[] = []

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    for (let pointIndex = 0; pointIndex < segment.length; pointIndex += 1) {
      const next = segment[pointIndex]
      const last = joined[joined.length - 1]
      if (last && last.x === next.x && last.y === next.y) {
        continue
      }
      joined.push(next)
    }
  }

  return joined
}

const createEllipseArc = (
  startDeg: number,
  endDeg: number,
  options: {
    centerX: number
    centerY: number
    radiusX: number
    radiusY: number
    segments?: number
  }
): Point[] => {
  const {
    centerX,
    centerY,
    radiusX,
    radiusY,
    segments = CURVE_SEGMENTS
  } = options
  const points: Point[] = []

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments
    const degrees = startDeg + (endDeg - startDeg) * progress
    const radians = degrees * (Math.PI / 180)
    points.push(
      point100(
        centerX + Math.cos(radians) * radiusX,
        centerY + Math.sin(radians) * radiusY
      )
    )
  }

  return points
}

const createCubicCurve = (
  start: readonly [number, number],
  control1: readonly [number, number],
  control2: readonly [number, number],
  end: readonly [number, number],
  segments = CURVE_SEGMENTS
): Point[] => {
  const points: Point[] = []

  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments
    const inverse = 1 - t
    const x =
      start[0] * inverse * inverse * inverse +
      3 * control1[0] * inverse * inverse * t +
      3 * control2[0] * inverse * t * t +
      end[0] * t * t * t
    const y =
      start[1] * inverse * inverse * inverse +
      3 * control1[1] * inverse * inverse * t +
      3 * control2[1] * inverse * t * t +
      end[1] * t * t * t

    points.push(point100(x, y))
  }

  return points
}

type LegacyShapeBounds = {
  left: number
  top: number
  right: number
  bottom: number
}

const roundShapeCoordinate = (
  value: number
) => Math.round(value * 1000) / 1000

const normalizeLegacyX = (
  source: LegacyShapeBounds,
  value: number
) => roundShapeCoordinate(
  ((value - source.left) / (source.right - source.left)) * OUTLINE_VIEWBOX
)

const normalizeLegacyY = (
  source: LegacyShapeBounds,
  value: number
) => roundShapeCoordinate(
  ((value - source.top) / (source.bottom - source.top)) * OUTLINE_VIEWBOX
)

const normalizeLegacyWidth = (
  source: LegacyShapeBounds,
  value: number
) => roundShapeCoordinate(
  (value / (source.right - source.left)) * OUTLINE_VIEWBOX
)

const normalizeLegacyHeight = (
  source: LegacyShapeBounds,
  value: number
) => roundShapeCoordinate(
  (value / (source.bottom - source.top)) * OUTLINE_VIEWBOX
)

const normalizeLegacyTuple = (
  source: LegacyShapeBounds,
  value: readonly [number, number]
): readonly [number, number] => [
  normalizeLegacyX(source, value[0]),
  normalizeLegacyY(source, value[1])
]

const normalizeLegacyPoint = (
  source: LegacyShapeBounds,
  value: readonly [number, number]
): Point => point100(
  normalizeLegacyX(source, value[0]),
  normalizeLegacyY(source, value[1])
)

const normalizeLegacyPolyline = (
  source: LegacyShapeBounds,
  ...values: ReadonlyArray<readonly [number, number]>
): Point[] => values.map((value) => normalizeLegacyPoint(source, value))

const createNormalizedRoundedRectOutline = (
  source: LegacyShapeBounds,
  options: {
    left: number
    top: number
    right: number
    bottom: number
    radiusX: number
    radiusY: number
  }
) => createRoundedRectOutline({
  left: normalizeLegacyX(source, options.left),
  top: normalizeLegacyY(source, options.top),
  right: normalizeLegacyX(source, options.right),
  bottom: normalizeLegacyY(source, options.bottom),
  radiusX: normalizeLegacyWidth(source, options.radiusX),
  radiusY: normalizeLegacyHeight(source, options.radiusY)
})

const createNormalizedEllipseArc = (
  source: LegacyShapeBounds,
  startDeg: number,
  endDeg: number,
  options: {
    centerX: number
    centerY: number
    radiusX: number
    radiusY: number
    segments?: number
  }
) => createEllipseArc(startDeg, endDeg, {
  centerX: normalizeLegacyX(source, options.centerX),
  centerY: normalizeLegacyY(source, options.centerY),
  radiusX: normalizeLegacyWidth(source, options.radiusX),
  radiusY: normalizeLegacyHeight(source, options.radiusY),
  segments: options.segments
})

const PATH_COMMAND_ARG_LENGTH: Partial<Record<string, number>> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7
}

const normalizeLegacyPathArgs = (
  source: LegacyShapeBounds,
  command: string,
  values: readonly number[]
) => {
  switch (command) {
    case 'M':
    case 'L':
    case 'T':
      return [
        normalizeLegacyX(source, values[0]!),
        normalizeLegacyY(source, values[1]!)
      ]
    case 'H':
      return [normalizeLegacyX(source, values[0]!)]
    case 'V':
      return [normalizeLegacyY(source, values[0]!)]
    case 'C':
      return [
        normalizeLegacyX(source, values[0]!),
        normalizeLegacyY(source, values[1]!),
        normalizeLegacyX(source, values[2]!),
        normalizeLegacyY(source, values[3]!),
        normalizeLegacyX(source, values[4]!),
        normalizeLegacyY(source, values[5]!)
      ]
    case 'S':
    case 'Q':
      return [
        normalizeLegacyX(source, values[0]!),
        normalizeLegacyY(source, values[1]!),
        normalizeLegacyX(source, values[2]!),
        normalizeLegacyY(source, values[3]!)
      ]
    case 'A':
      return [
        normalizeLegacyWidth(source, values[0]!),
        normalizeLegacyHeight(source, values[1]!),
        values[2]!,
        values[3]!,
        values[4]!,
        normalizeLegacyX(source, values[5]!),
        normalizeLegacyY(source, values[6]!)
      ]
    default:
      return [...values]
  }
}

const normalizeLegacyPathData = (
  source: LegacyShapeBounds,
  d: string
) => {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? []
  const output: string[] = []
  let index = 0
  let command: string | undefined

  while (index < tokens.length) {
    const token = tokens[index]!
    if (/^[A-Za-z]$/.test(token)) {
      command = token
      output.push(token)
      index += 1
      if (command === 'Z') {
        continue
      }
    }

    if (!command) {
      break
    }

    const argLength = PATH_COMMAND_ARG_LENGTH[command]
    if (!argLength) {
      continue
    }

    while (index < tokens.length && !/^[A-Za-z]$/.test(tokens[index]!)) {
      const values = tokens
        .slice(index, index + argLength)
        .map((value) => Number(value))
      if (values.length < argLength) {
        break
      }

      output.push(
        normalizeLegacyPathArgs(source, command, values)
          .map((value) => String(value))
          .join(' ')
      )
      index += argLength

      if (command === 'M') {
        command = 'L'
      }
    }
  }

  return output.join(' ')
}

const createRoundedRectOutline = (options: {
  left: number
  top: number
  right: number
  bottom: number
  radiusX: number
  radiusY: number
}): ShapeOutlineSpec => {
  const {
    left,
    top,
    right,
    bottom,
    radiusX,
    radiusY
  } = options

  if (radiusX <= 0 || radiusY <= 0) {
    return {
      top: polyline100([left, top], [right, top]),
      right: polyline100([right, top], [right, bottom]),
      bottom: polyline100([left, bottom], [right, bottom]),
      left: polyline100([left, top], [left, bottom])
    }
  }

  const topLeftCenterX = left + radiusX
  const topLeftCenterY = top + radiusY
  const topRightCenterX = right - radiusX
  const topRightCenterY = top + radiusY
  const bottomRightCenterX = right - radiusX
  const bottomRightCenterY = bottom - radiusY
  const bottomLeftCenterX = left + radiusX
  const bottomLeftCenterY = bottom - radiusY

  return {
    top: joinPolyline(
      createEllipseArc(180, 270, {
        centerX: topLeftCenterX,
        centerY: topLeftCenterY,
        radiusX,
        radiusY
      }),
      polyline100([topRightCenterX, top]),
      createEllipseArc(270, 360, {
        centerX: topRightCenterX,
        centerY: topRightCenterY,
        radiusX,
        radiusY
      })
    ),
    right: joinPolyline(
      createEllipseArc(270, 360, {
        centerX: topRightCenterX,
        centerY: topRightCenterY,
        radiusX,
        radiusY
      }),
      polyline100([right, bottomRightCenterY]),
      createEllipseArc(0, 90, {
        centerX: bottomRightCenterX,
        centerY: bottomRightCenterY,
        radiusX,
        radiusY
      })
    ),
    bottom: joinPolyline(
      createEllipseArc(180, 90, {
        centerX: bottomLeftCenterX,
        centerY: bottomLeftCenterY,
        radiusX,
        radiusY
      }),
      polyline100([bottomRightCenterX, bottom]),
      createEllipseArc(90, 0, {
        centerX: bottomRightCenterX,
        centerY: bottomRightCenterY,
        radiusX,
        radiusY
      })
    ),
    left: joinPolyline(
      createEllipseArc(270, 180, {
        centerX: topLeftCenterX,
        centerY: topLeftCenterY,
        radiusX,
        radiusY
      }),
      polyline100([left, bottomLeftCenterY]),
      createEllipseArc(180, 90, {
        centerX: bottomLeftCenterX,
        centerY: bottomLeftCenterY,
        radiusX,
        radiusY
      })
    )
  }
}

const createRectPath = (options: {
  left: number
  top: number
  right: number
  bottom: number
}) => {
  const {
    left,
    top,
    right,
    bottom
  } = options

  return `M${left} ${top} H${right} V${bottom} H${left} Z`
}

const createRoundedRectPath = (options: {
  left: number
  top: number
  right: number
  bottom: number
  radiusX: number
  radiusY: number
}) => {
  const {
    left,
    top,
    right,
    bottom,
    radiusX,
    radiusY
  } = options

  if (radiusX <= 0 || radiusY <= 0) {
    return createRectPath({ left, top, right, bottom })
  }

  return [
    `M${left + radiusX} ${top}`,
    `H${right - radiusX}`,
    `A${radiusX} ${radiusY} 0 0 1 ${right} ${top + radiusY}`,
    `V${bottom - radiusY}`,
    `A${radiusX} ${radiusY} 0 0 1 ${right - radiusX} ${bottom}`,
    `H${left + radiusX}`,
    `A${radiusX} ${radiusY} 0 0 1 ${left} ${bottom - radiusY}`,
    `V${top + radiusY}`,
    `A${radiusX} ${radiusY} 0 0 1 ${left + radiusX} ${top}`,
    'Z'
  ].join(' ')
}

const createEllipsePath = (options: {
  centerX: number
  centerY: number
  radiusX: number
  radiusY: number
}) => {
  const {
    centerX,
    centerY,
    radiusX,
    radiusY
  } = options

  return [
    `M${centerX - radiusX} ${centerY}`,
    `A${radiusX} ${radiusY} 0 1 1 ${centerX + radiusX} ${centerY}`,
    `A${radiusX} ${radiusY} 0 1 1 ${centerX - radiusX} ${centerY}`,
    'Z'
  ].join(' ')
}

const createPolygonPath = (
  ...values: ReadonlyArray<readonly [number, number]>
) => values.length
  ? `M${values.map(([x, y]) => `${x} ${y}`).join(' L')} Z`
  : ''

const createOpenPolylinePath = (
  ...values: ReadonlyArray<readonly [number, number]>
) => values.length
  ? `M${values.map(([x, y]) => `${x} ${y}`).join(' L')}`
  : ''

const createOuterPath = (
  d: string,
  overrides: Partial<ShapePathSpec> = {}
): ShapePathSpec => ({
  d,
  fill: 'inherit',
  stroke: 'inherit',
  strokeLinejoin: 'round',
  strokeLinecap: 'butt',
  ...overrides
})

const createDecorationPath = (
  d: string,
  overrides: Partial<ShapePathSpec> = {}
): ShapePathSpec => ({
  d,
  fill: 'none',
  stroke: 'inherit',
  strokeLinejoin: 'round',
  strokeLinecap: 'butt',
  ...overrides
})

const createShapeDescriptor = (
  input: Omit<ShapeDescriptor, 'defaults' | 'previewFill'> & {
    defaults?: ShapeSpec['defaults']
    previewFill?: string
  }
): ShapeDescriptor => ({
  ...input,
  defaults: input.defaults ?? {
    fill: DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
    color: DEFAULT_TEXT
  },
  previewFill: input.previewFill ?? DEFAULT_PREVIEW_FILL
})

const LEGACY_INSET_BOUNDS: LegacyShapeBounds = {
  left: 3,
  top: 3,
  right: 97,
  bottom: 97
}

const STAR_BOUNDS: LegacyShapeBounds = {
  left: 4,
  top: 4,
  right: 96,
  bottom: 96
}

const SEMICIRCLE_BOUNDS: LegacyShapeBounds = {
  left: 3,
  top: 50,
  right: 97,
  bottom: 97
}

const normalizeInsetPath = (
  d: string
) => normalizeLegacyPathData(LEGACY_INSET_BOUNDS, d)

const normalizeStarPath = (
  d: string
) => normalizeLegacyPathData(STAR_BOUNDS, d)

const normalizeSemicirclePath = (
  d: string
) => normalizeLegacyPathData(SEMICIRCLE_BOUNDS, d)

const RECT_OUTLINE = createNormalizedRoundedRectOutline(
  LEGACY_INSET_BOUNDS,
  {
    left: 3,
    top: 3,
    right: 97,
    bottom: 97,
    radiusX: 0,
    radiusY: 0
  }
)

const ROUNDED_RECT_OUTLINE = createNormalizedRoundedRectOutline(
  LEGACY_INSET_BOUNDS,
  {
    left: 3,
    top: 3,
    right: 97,
    bottom: 97,
    radiusX: 14,
    radiusY: 14
  }
)

const PILL_OUTLINE = createNormalizedRoundedRectOutline(
  LEGACY_INSET_BOUNDS,
  {
    left: 3,
    top: 3,
    right: 97,
    bottom: 97,
    radiusX: 47,
    radiusY: 47
  }
)

const ELLIPSE_OUTLINE: ShapeOutlineSpec = {
  top: createNormalizedEllipseArc(LEGACY_INSET_BOUNDS, 180, 360, {
    centerX: 50,
    centerY: 50,
    radiusX: 47,
    radiusY: 47
  }),
  right: createNormalizedEllipseArc(LEGACY_INSET_BOUNDS, 270, 450, {
    centerX: 50,
    centerY: 50,
    radiusX: 47,
    radiusY: 47
  }),
  bottom: createNormalizedEllipseArc(LEGACY_INSET_BOUNDS, 180, 0, {
    centerX: 50,
    centerY: 50,
    radiusX: 47,
    radiusY: 47
  }),
  left: createNormalizedEllipseArc(LEGACY_INSET_BOUNDS, 270, 90, {
    centerX: 50,
    centerY: 50,
    radiusX: 47,
    radiusY: 47
  })
}

const DIAMOND_OUTLINE: ShapeOutlineSpec = {
  top: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 50], [50, 3], [97, 50]),
  right: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [50, 3], [97, 50], [50, 97]),
  bottom: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 50], [50, 97], [97, 50]),
  left: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [50, 3], [3, 50], [50, 97])
}

const TRIANGLE_OUTLINE: ShapeOutlineSpec = {
  top: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 97], [50, 3], [97, 97]),
  right: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [50, 3], [97, 97]),
  bottom: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 97], [97, 97]),
  left: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [50, 3], [3, 97])
}

const HEXAGON_OUTLINE: ShapeOutlineSpec = {
  top: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [22, 3], [78, 3]),
  right: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [78, 3], [97, 50], [78, 97]),
  bottom: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [22, 97], [78, 97]),
  left: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [22, 3], [3, 50], [22, 97])
}

const PARALLELOGRAM_OUTLINE: ShapeOutlineSpec = {
  top: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [20, 3], [97, 3]),
  right: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [97, 3], [80, 97]),
  bottom: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 97], [80, 97]),
  left: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [20, 3], [3, 97])
}

const STAR_OUTLINE: ShapeOutlineSpec = {
  top: normalizeLegacyPolyline(STAR_BOUNDS, [39, 35], [50, 4], [61, 35]),
  right: normalizeLegacyPolyline(STAR_BOUNDS, [61, 35], [96, 35], [68, 56], [79, 96]),
  bottom: normalizeLegacyPolyline(STAR_BOUNDS, [21, 96], [50, 74], [79, 96]),
  left: normalizeLegacyPolyline(STAR_BOUNDS, [21, 96], [32, 56], [4, 35], [39, 35])
}

const PENTAGON_OUTLINE: ShapeOutlineSpec = {
  top: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 38], [50, 3], [97, 38]),
  right: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [50, 3], [97, 38], [79, 97]),
  bottom: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [21, 97], [79, 97]),
  left: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [50, 3], [3, 38], [21, 97])
}

const TRAPEZOID_OUTLINE: ShapeOutlineSpec = {
  top: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [14, 3], [86, 3]),
  right: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [86, 3], [97, 97]),
  bottom: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 97], [97, 97]),
  left: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [14, 3], [3, 97])
}

const SEMICIRCLE_OUTLINE: ShapeOutlineSpec = {
  top: createNormalizedEllipseArc(SEMICIRCLE_BOUNDS, 180, 360, {
    centerX: 50,
    centerY: 97,
    radiusX: 47,
    radiusY: 47
  }),
  right: createNormalizedEllipseArc(SEMICIRCLE_BOUNDS, 270, 360, {
    centerX: 50,
    centerY: 97,
    radiusX: 47,
    radiusY: 47
  }),
  bottom: normalizeLegacyPolyline(SEMICIRCLE_BOUNDS, [3, 97], [97, 97]),
  left: createNormalizedEllipseArc(SEMICIRCLE_BOUNDS, 180, 270, {
    centerX: 50,
    centerY: 97,
    radiusX: 47,
    radiusY: 47
  })
}

const CYLINDER_OUTLINE: ShapeOutlineSpec = {
  top: createEllipseArc(180, 360, {
    centerX: 50,
    centerY: 10,
    radiusX: 50,
    radiusY: 10
  }),
  right: polyline100([100, 10], [100, 90]),
  bottom: createEllipseArc(0, 180, {
    centerX: 50,
    centerY: 90,
    radiusX: 50,
    radiusY: 10
  }),
  left: polyline100([0, 10], [0, 90])
}

const DOCUMENT_OUTLINE: ShapeOutlineSpec = {
  top: polyline100([0, 0], [100, 0]),
  right: polyline100([100, 0], [100, 86]),
  bottom: polyline100([0, 86], [25, 100], [50, 86], [75, 100], [100, 86]),
  left: polyline100([0, 0], [0, 86])
}

const BEVEL_RECT_OUTLINE: ShapeOutlineSpec = {
  top: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [14, 3], [86, 3]),
  right: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [86, 3], [97, 14], [97, 86], [86, 97]),
  bottom: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [14, 97], [86, 97]),
  left: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [14, 3], [3, 14], [3, 86], [14, 97])
}

const DELAY_OUTLINE: ShapeOutlineSpec = {
  top: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 3], [55, 3]),
  right: createNormalizedEllipseArc(LEGACY_INSET_BOUNDS, 270, 450, {
    centerX: 55,
    centerY: 50,
    radiusX: 42,
    radiusY: 47
  }),
  bottom: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 97], [55, 97]),
  left: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 3], [3, 97])
}

const MANUAL_INPUT_OUTLINE: ShapeOutlineSpec = {
  top: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 25], [97, 3]),
  right: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [97, 3], [97, 97]),
  bottom: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 97], [97, 97]),
  left: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 25], [3, 97])
}

const MANUAL_OPERATION_OUTLINE: ShapeOutlineSpec = {
  top: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 3], [97, 3]),
  right: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [97, 3], [84, 97]),
  bottom: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [16, 97], [84, 97]),
  left: normalizeLegacyPolyline(LEGACY_INSET_BOUNDS, [3, 3], [16, 97])
}

const CALLOUT_OUTLINE: ShapeOutlineSpec = {
  top: joinPolyline(
    createCubicCurve(
      [3, 13],
      [3, 8],
      [5, 4],
      [9, 4]
    ),
    polyline100([91, 4]),
    createCubicCurve(
      [91, 4],
      [95, 4],
      [97, 8],
      [97, 13]
    )
  ),
  right: joinPolyline(
    polyline100([97, 13], [97, 71]),
    createCubicCurve(
      [97, 71],
      [97, 78],
      [92, 82],
      [86, 82]
    )
  ),
  bottom: polyline100(
    [14, 82],
    [40, 82],
    [35, 97],
    [58, 82],
    [86, 82]
  ),
  left: joinPolyline(
    createCubicCurve(
      [9, 4],
      [5, 4],
      [3, 8],
      [3, 13]
    ),
    polyline100([3, 71]),
    createCubicCurve(
      [3, 71],
      [3, 78],
      [8, 82],
      [14, 82]
    )
  )
}

const ROUNDRECT_BUBBLE_OUTLINE: ShapeOutlineSpec = {
  top: joinPolyline(
    createCubicCurve(
      [3, 17],
      [3, 10],
      [7, 6],
      [14, 6]
    ),
    polyline100([86, 6]),
    createCubicCurve(
      [86, 6],
      [93, 6],
      [97, 10],
      [97, 17]
    )
  ),
  right: joinPolyline(
    polyline100([97, 17], [97, 63]),
    createCubicCurve(
      [97, 63],
      [97, 70],
      [93, 74],
      [86, 74]
    )
  ),
  bottom: polyline100(
    [14, 74],
    [40, 74],
    [36, 94],
    [56, 74],
    [86, 74]
  ),
  left: joinPolyline(
    createCubicCurve(
      [14, 6],
      [7, 6],
      [3, 10],
      [3, 17]
    ),
    polyline100([3, 63]),
    createCubicCurve(
      [3, 63],
      [3, 70],
      [7, 74],
      [14, 74]
    )
  )
}

const ELLIPSE_BUBBLE_OUTLINE: ShapeOutlineSpec = {
  top: joinPolyline(
    createCubicCurve(
      [8, 45],
      [8, 25],
      [27, 10],
      [50, 10]
    ),
    createCubicCurve(
      [50, 10],
      [73, 10],
      [92, 25],
      [92, 45]
    )
  ),
  right: createCubicCurve(
    [92, 45],
    [92, 65],
    [73, 80],
    [50, 80]
  ),
  bottom: polyline100(
    [24, 72],
    [18, 92],
    [35, 78],
    [50, 80]
  ),
  left: joinPolyline(
    createCubicCurve(
      [50, 10],
      [27, 10],
      [8, 25],
      [8, 45]
    ),
    createCubicCurve(
      [8, 45],
      [8, 57],
      [14, 66],
      [24, 72]
    )
  )
}

const CLOUD_OUTLINE: ShapeOutlineSpec = {
  top: joinPolyline(
    createCubicCurve(
      [23, 33],
      [29, 23],
      [39, 17],
      [50, 17]
    ),
    createCubicCurve(
      [50, 17],
      [62, 17],
      [74, 27],
      [77, 43]
    )
  ),
  right: joinPolyline(
    createCubicCurve(
      [77, 43],
      [89, 44],
      [97, 53],
      [97, 65]
    ),
    createCubicCurve(
      [97, 65],
      [97, 77],
      [88, 86],
      [76, 86]
    )
  ),
  bottom: joinPolyline(
    createCubicCurve(
      [23, 75],
      [22, 81],
      [22, 84],
      [23, 86]
    ),
    polyline100([76, 86])
  ),
  left: joinPolyline(
    createCubicCurve(
      [23, 33],
      [11, 33],
      [3, 42],
      [3, 53]
    ),
    createCubicCurve(
      [3, 53],
      [3, 65],
      [12, 75],
      [23, 75]
    )
  )
}

const ARROW_OUTLINE: ShapeOutlineSpec = {
  top: polyline100([3, 25], [58, 25], [58, 4], [97, 50]),
  right: polyline100([58, 4], [97, 50], [58, 96]),
  bottom: polyline100([3, 75], [58, 75], [58, 96], [97, 50]),
  left: polyline100([3, 25], [3, 75])
}

const HIGHLIGHT_OUTLINE = createRoundedRectOutline({
  left: 3,
  top: 22,
  right: 97,
  bottom: 78,
  radiusX: 18,
  radiusY: 18
})

const SHAPE_DESCRIPTORS_LIST: readonly ShapeDescriptor[] = [
  createShapeDescriptor({
    kind: 'rect',
    label: 'Rectangle',
    group: 'basic',
    defaultSize: { width: 180, height: 100 },
    defaultText: 'Rectangle',
    labelInset: {
      top: 16,
      right: 16,
      bottom: 16,
      left: 16
    },
    outline: RECT_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createRoundedRectPath({
          left: 3,
          top: 3,
          right: 97,
          bottom: 97,
          radiusX: 2,
          radiusY: 2
        }))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'rounded-rect',
    label: 'Rounded',
    group: 'basic',
    defaultSize: { width: 180, height: 100 },
    defaultText: 'Rounded',
    labelInset: {
      top: 16,
      right: 18,
      bottom: 16,
      left: 18
    },
    outline: ROUNDED_RECT_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createRoundedRectPath({
          left: 3,
          top: 3,
          right: 97,
          bottom: 97,
          radiusX: 14,
          radiusY: 14
        }))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'pill',
    label: 'Terminator',
    group: 'flowchart',
    defaultSize: { width: 200, height: 100 },
    defaultText: 'Start',
    labelInset: {
      top: 20,
      right: 28,
      bottom: 20,
      left: 28
    },
    outline: PILL_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createRoundedRectPath({
          left: 3,
          top: 3,
          right: 97,
          bottom: 97,
          radiusX: 47,
          radiusY: 47
        }))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'ellipse',
    label: 'Ellipse',
    group: 'basic',
    defaultSize: { width: 180, height: 110 },
    defaultText: 'Ellipse',
    labelInset: {
      top: '20%',
      right: '18%',
      bottom: '20%',
      left: '18%'
    },
    outline: ELLIPSE_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createEllipsePath({
          centerX: 50,
          centerY: 50,
          radiusX: 47,
          radiusY: 47
        }))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'diamond',
    label: 'Diamond',
    group: 'basic',
    defaultSize: { width: 180, height: 120 },
    defaultText: 'Decision',
    labelInset: {
      top: '22%',
      right: '24%',
      bottom: '22%',
      left: '24%'
    },
    outline: DIAMOND_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createPolygonPath(
          [50, 3],
          [97, 50],
          [50, 97],
          [3, 50]
        ))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'triangle',
    label: 'Triangle',
    group: 'basic',
    defaultSize: { width: 180, height: 130 },
    defaultText: 'Triangle',
    labelInset: {
      top: '34%',
      right: '20%',
      bottom: 18,
      left: '20%'
    },
    outline: TRIANGLE_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createPolygonPath(
          [50, 3],
          [97, 97],
          [3, 97]
        ))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'hexagon',
    label: 'Hexagon',
    group: 'basic',
    defaultSize: { width: 190, height: 110 },
    defaultText: 'Hexagon',
    labelInset: {
      top: 16,
      right: '18%',
      bottom: 16,
      left: '18%'
    },
    outline: HEXAGON_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createPolygonPath(
          [22, 3],
          [78, 3],
          [97, 50],
          [78, 97],
          [22, 97],
          [3, 50]
        ))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'parallelogram',
    label: 'Data',
    group: 'flowchart',
    defaultSize: { width: 200, height: 110 },
    defaultText: 'Input / Output',
    labelInset: {
      top: '14%',
      right: '21%',
      bottom: '14%',
      left: '21%'
    },
    outline: PARALLELOGRAM_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createPolygonPath(
          [20, 3],
          [97, 3],
          [80, 97],
          [3, 97]
        ))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'star',
    label: 'Star',
    group: 'basic',
    defaultSize: { width: 190, height: 180 },
    defaultText: 'Star',
    labelInset: {
      top: '24%',
      right: '18%',
      bottom: '22%',
      left: '18%'
    },
    outline: STAR_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeStarPath(createPolygonPath(
          [50, 4],
          [61, 35],
          [96, 35],
          [68, 56],
          [79, 96],
          [50, 74],
          [21, 96],
          [32, 56],
          [4, 35],
          [39, 35]
        ))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'pentagon',
    label: 'Pentagon',
    group: 'basic',
    defaultSize: { width: 180, height: 140 },
    defaultText: 'Pentagon',
    labelInset: {
      top: '24%',
      right: '18%',
      bottom: '18%',
      left: '18%'
    },
    outline: PENTAGON_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createPolygonPath(
          [50, 3],
          [97, 38],
          [79, 97],
          [21, 97],
          [3, 38]
        ))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'trapezoid',
    label: 'Trapezoid',
    group: 'basic',
    defaultSize: { width: 190, height: 130 },
    defaultText: 'Trapezoid',
    labelInset: {
      top: '16%',
      right: '17%',
      bottom: '14%',
      left: '17%'
    },
    outline: TRAPEZOID_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createPolygonPath(
          [14, 3],
          [86, 3],
          [97, 97],
          [3, 97]
        ))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'semicircle',
    label: 'Semicircle',
    group: 'basic',
    defaultSize: { width: 190, height: 120 },
    defaultText: 'Semicircle',
    labelInset: {
      top: '34%',
      right: '16%',
      bottom: 14,
      left: '16%'
    },
    outline: SEMICIRCLE_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeSemicirclePath('M3 97 A47 47 0 0 1 97 97 Z')
      )
    }
  }),
  createShapeDescriptor({
    kind: 'cylinder',
    label: 'Database',
    group: 'flowchart',
    defaultSize: { width: 180, height: 130 },
    defaultText: 'Database',
    labelInset: {
      top: '20%',
      right: '16%',
      bottom: '18%',
      left: '16%'
    },
    outline: CYLINDER_OUTLINE,
    visual: {
      outer: createOuterPath(
        'M0 10 A50 10 0 0 1 100 10 V90 A50 10 0 0 1 0 90 Z'
      ),
      decorations: [
        createDecorationPath(
          createEllipsePath({
            centerX: 50,
            centerY: 10,
            radiusX: 50,
            radiusY: 10
          }),
          {
            strokeLinecap: 'round'
          }
        ),
        createDecorationPath(
          'M0 90 A50 10 0 0 0 100 90',
          {
            strokeLinecap: 'round'
          }
        )
      ]
    }
  }),
  createShapeDescriptor({
    kind: 'document',
    label: 'Document',
    group: 'flowchart',
    defaultSize: { width: 190, height: 130 },
    defaultText: 'Document',
    labelInset: {
      top: '12%',
      right: '12%',
      bottom: '22%',
      left: '12%'
    },
    outline: DOCUMENT_OUTLINE,
    visual: {
      outer: createOuterPath(
        'M0 0 H100 V86 Q87.5 86 75 100 Q62.5 86 50 86 Q37.5 86 25 100 Q12.5 86 0 86 Z'
      )
    }
  }),
  createShapeDescriptor({
    kind: 'predefined-process',
    label: 'Subprocess',
    group: 'flowchart',
    defaultSize: { width: 210, height: 110 },
    defaultText: 'Subprocess',
    labelInset: {
      top: '14%',
      right: '22%',
      bottom: '14%',
      left: '22%'
    },
    outline: RECT_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createRectPath({
          left: 3,
          top: 3,
          right: 97,
          bottom: 97
        }))
      ),
      decorations: [
        createDecorationPath(
          normalizeInsetPath(createOpenPolylinePath(
            [18, 3],
            [18, 97]
          ))
        ),
        createDecorationPath(
          normalizeInsetPath(createOpenPolylinePath(
            [82, 3],
            [82, 97]
          ))
        )
      ]
    }
  }),
  createShapeDescriptor({
    kind: 'bevel-rect',
    label: 'Bevel',
    group: 'flowchart',
    defaultSize: { width: 190, height: 110 },
    defaultText: 'Process',
    labelInset: {
      top: 16,
      right: 18,
      bottom: 16,
      left: 18
    },
    outline: BEVEL_RECT_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createPolygonPath(
          [14, 3],
          [86, 3],
          [97, 14],
          [97, 86],
          [86, 97],
          [14, 97],
          [3, 86],
          [3, 14]
        ))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'delay',
    label: 'Delay',
    group: 'flowchart',
    defaultSize: { width: 190, height: 110 },
    defaultText: 'Delay',
    labelInset: {
      top: '16%',
      right: '24%',
      bottom: '16%',
      left: '14%'
    },
    outline: DELAY_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath('M3 3 H55 A42 47 0 0 1 55 97 H3 Z')
      )
    }
  }),
  createShapeDescriptor({
    kind: 'manual-input',
    label: 'Manual Input',
    group: 'flowchart',
    defaultSize: { width: 200, height: 120 },
    defaultText: 'Manual Input',
    labelInset: {
      top: '20%',
      right: '12%',
      bottom: '14%',
      left: '12%'
    },
    outline: MANUAL_INPUT_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createPolygonPath(
          [3, 25],
          [97, 3],
          [97, 97],
          [3, 97]
        ))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'manual-operation',
    label: 'Manual Operation',
    group: 'flowchart',
    defaultSize: { width: 200, height: 120 },
    defaultText: 'Manual Operation',
    labelInset: {
      top: '14%',
      right: '18%',
      bottom: '14%',
      left: '18%'
    },
    outline: MANUAL_OPERATION_OUTLINE,
    visual: {
      outer: createOuterPath(
        normalizeInsetPath(createPolygonPath(
          [3, 3],
          [97, 3],
          [84, 97],
          [16, 97]
        ))
      )
    }
  }),
  createShapeDescriptor({
    kind: 'callout',
    label: 'Callout',
    group: 'annotation',
    defaultSize: { width: 240, height: 140 },
    defaultText: 'Callout',
    labelInset: {
      top: '12%',
      right: '12%',
      bottom: '24%',
      left: '12%'
    },
    outline: CALLOUT_OUTLINE,
    visual: {
      outer: createOuterPath(
        'M9 4 H91 C95 4 97 8 97 13 V71 C97 78 92 82 86 82 H58 L35 97 L40 82 H14 C8 82 3 78 3 71 V13 C3 8 5 4 9 4 Z'
      )
    }
  }),
  createShapeDescriptor({
    kind: 'roundrect-bubble',
    label: 'Speech Bubble',
    group: 'annotation',
    defaultSize: { width: 240, height: 150 },
    defaultText: 'Speech Bubble',
    labelInset: {
      top: '12%',
      right: '12%',
      bottom: '24%',
      left: '12%'
    },
    outline: ROUNDRECT_BUBBLE_OUTLINE,
    visual: {
      outer: createOuterPath(
        'M14 6 H86 A11 11 0 0 1 97 17 V63 A11 11 0 0 1 86 74 H56 L36 94 L40 74 H14 A11 11 0 0 1 3 63 V17 A11 11 0 0 1 14 6 Z'
      )
    }
  }),
  createShapeDescriptor({
    kind: 'ellipse-bubble',
    label: 'Ellipse Bubble',
    group: 'annotation',
    defaultSize: { width: 240, height: 160 },
    defaultText: 'Ellipse Bubble',
    labelInset: {
      top: '18%',
      right: '16%',
      bottom: '24%',
      left: '16%'
    },
    outline: ELLIPSE_BUBBLE_OUTLINE,
    visual: {
      outer: createOuterPath(
        'M50 10 C73 10 92 25 92 45 C92 65 73 80 50 80 C45 80 40 79 35 78 L18 92 L24 72 C14 66 8 57 8 45 C8 25 27 10 50 10 Z'
      )
    }
  }),
  createShapeDescriptor({
    kind: 'cloud',
    label: 'Cloud',
    group: 'annotation',
    defaultSize: { width: 220, height: 140 },
    defaultText: 'Cloud',
    labelInset: {
      top: '22%',
      right: '16%',
      bottom: '18%',
      left: '16%'
    },
    outline: CLOUD_OUTLINE,
    visual: {
      outer: createOuterPath(
        'M23 86 H76 C88 86 97 77 97 65 C97 53 89 44 77 43 C74 27 62 17 50 17 C39 17 29 23 23 33 C11 33 3 42 3 53 C3 65 12 75 23 75 C22 81 22 84 23 86 Z',
        {
          strokeLinecap: 'round'
        }
      )
    }
  }),
  createShapeDescriptor({
    kind: 'arrow-sticker',
    label: 'Arrow',
    group: 'annotation',
    defaultSize: { width: 220, height: 110 },
    defaultText: 'Arrow',
    defaults: {
      fill: ARROW_STICKER_PAINT.fill,
      stroke: ARROW_STICKER_PAINT.stroke,
      color: ARROW_STICKER_PAINT.color
    },
    previewFill: ARROW_STICKER_PAINT.previewFill,
    labelInset: {
      top: '14%',
      right: '40%',
      bottom: '14%',
      left: '10%'
    },
    outline: ARROW_OUTLINE,
    visual: {
      outer: createOuterPath(
        createPolygonPath(
          [3, 25],
          [58, 25],
          [58, 4],
          [97, 50],
          [58, 96],
          [58, 75],
          [3, 75]
        )
      )
    }
  }),
  createShapeDescriptor({
    kind: 'highlight',
    label: 'Highlight',
    group: 'annotation',
    defaultSize: { width: 220, height: 90 },
    defaultText: 'Highlight',
    defaults: {
      fill: HIGHLIGHT_PAINT.fill,
      stroke: HIGHLIGHT_PAINT.stroke,
      color: HIGHLIGHT_PAINT.color
    },
    previewFill: HIGHLIGHT_PAINT.previewFill,
    labelInset: {
      top: '18%',
      right: '10%',
      bottom: '18%',
      left: '10%'
    },
    outline: HIGHLIGHT_OUTLINE,
    visual: {
      outer: createOuterPath(
        createRoundedRectPath({
          left: 3,
          top: 22,
          right: 97,
          bottom: 78,
          radiusX: 18,
          radiusY: 18
        }),
        {
          strokeLinecap: 'round'
        }
      ),
      decorations: [
        createDecorationPath(
          'M8 79 C25 89 41 69 57 79 S83 89 96 78',
          {
            strokeLinecap: 'round',
            strokeWidthAdjust: -0.2,
            strokeWidthMin: 1
          }
        )
      ]
    }
  })
] as const

export const SHAPE_DESCRIPTORS: readonly ShapeDescriptor[] = SHAPE_DESCRIPTORS_LIST

const SHAPE_KIND_SET = new Set<ShapeKind>(
  SHAPE_DESCRIPTORS_LIST.map((descriptor) => descriptor.kind)
)

const SHAPE_DESCRIPTOR_BY_KIND = new Map(
  SHAPE_DESCRIPTORS_LIST.map((descriptor) => [descriptor.kind, descriptor] as const)
)

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

export const readShapeDescriptor = (
  kind: ShapeKind | undefined
): ShapeDescriptor => SHAPE_DESCRIPTOR_BY_KIND.get(kind ?? DEFAULT_SHAPE_KIND) ?? SHAPE_DESCRIPTOR_BY_KIND.get(DEFAULT_SHAPE_KIND)!

export const SHAPE_SPECS: readonly ShapeSpec[] = SHAPE_DESCRIPTORS

export const readShapeSpec = (
  kind: ShapeKind | undefined
): ShapeSpec => readShapeDescriptor(kind)

export const readShapeMeta = (
  node: Pick<Node, 'data'>
): ShapeMeta => {
  const spec = readShapeDescriptor(readShapeKind(node))

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
  const spec = readShapeDescriptor(kind)

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
    items: SHAPE_DESCRIPTORS.filter((spec) => spec.group === 'basic')
  },
  {
    key: 'flowchart',
    title: 'Flowchart',
    items: SHAPE_DESCRIPTORS.filter((spec) => spec.group === 'flowchart')
  },
  {
    key: 'annotation',
    title: 'Annotation',
    items: SHAPE_DESCRIPTORS.filter((spec) => spec.group === 'annotation')
  }
] as const

export const readShapePreviewFill = (
  kind: ShapeKind
): string => readShapeDescriptor(kind).previewFill ?? DEFAULT_PREVIEW_FILL
