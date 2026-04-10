import {
  readShapeKind,
  readShapeMeta,
  readShapeSpec
} from '@whiteboard/core/node'
import { useCallback, useRef, type CSSProperties } from 'react'
import type { NodeDefinition, NodeRenderProps } from '#react/types/node'
import { useEditor } from '#react/runtime/hooks'
import {
  ShapeGlyph
} from '../../shape'
import { bindNodeTextSource, TEXT_DEFAULT_FONT_SIZE } from '../../text'
import {
  createSchema,
  createTextField,
  getStyleNumberArray,
  getStyleNumber,
  getStyleString,
  styleField
} from './shared'

const shapeSchema = createSchema('shape', 'Shape', [
  styleField('fillOpacity', 'Fill opacity', 'number', { min: 0, max: 1, step: 0.05 }),
  createTextField('text'),
  styleField('fill', 'Fill', 'color'),
  styleField('stroke', 'Stroke', 'color'),
  styleField('strokeWidth', 'Stroke width', 'number', { min: 0, step: 1 }),
  styleField('strokeOpacity', 'Stroke opacity', 'number', { min: 0, max: 1, step: 0.05 }),
  styleField('strokeDash', 'Stroke dash', 'string'),
  styleField('color', 'Text color', 'color'),
  styleField('fontSize', 'Font size', 'number', { min: 8, step: 1 }),
  styleField('fontWeight', 'Font weight', 'number', { min: 100, max: 900, step: 100 }),
  styleField('fontStyle', 'Font style', 'string'),
  styleField('textAlign', 'Text align', 'string')
])

const readShapeColors = (
  props: NodeRenderProps
) => {
  const kind = readShapeKind(props.node)
  const spec = readShapeSpec(kind)

  return {
    kind,
    fill: getStyleString(props.node, 'fill') ?? spec.defaults.fill,
    fillOpacity: getStyleNumber(props.node, 'fillOpacity') ?? 1,
    stroke: getStyleString(props.node, 'stroke') ?? spec.defaults.stroke,
    strokeOpacity: getStyleNumber(props.node, 'strokeOpacity') ?? 1,
    strokeDash: getStyleNumberArray(props.node, 'strokeDash'),
    color: getStyleString(props.node, 'color') ?? spec.defaults.color,
    strokeWidth: getStyleNumber(props.node, 'strokeWidth') ?? (props.hovered ? 1.6 : 1.2),
    fontSize: getStyleNumber(props.node, 'fontSize') ?? TEXT_DEFAULT_FONT_SIZE,
    fontWeight: getStyleNumber(props.node, 'fontWeight') ?? 400,
    fontStyle: getStyleString(props.node, 'fontStyle') ?? 'normal',
    textAlign: getStyleString(props.node, 'textAlign') ?? 'center'
  }
}

const ShapeLabel = ({
  node,
  color,
  fontSize,
  fontWeight,
  fontStyle,
  textAlign,
  kind
}: NodeRenderProps & {
  kind: ReturnType<typeof readShapeKind>
  color: string
  fontSize: number
  fontWeight: number
  fontStyle: string
  textAlign: string
}) => {
  const editor = useEditor()
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const labelRef = useRef<HTMLDivElement | null>(null)
  const bindRef = useCallback((element: HTMLDivElement | null) => {
    bindNodeTextSource({
      editor,
      nodeId: node.id,
      field: 'text',
      current: labelRef.current,
      next: element
    })
    labelRef.current = element
  }, [editor, node.id])

  const style: CSSProperties = {
    ...readShapeSpec(kind).labelInset,
    color,
    fontSize,
    fontWeight,
    fontStyle,
    textAlign: textAlign as CSSProperties['textAlign'],
    justifyContent:
      textAlign === 'left'
        ? 'flex-start'
        : textAlign === 'right'
          ? 'flex-end'
          : 'center',
    opacity: text ? 1 : 0.48
  }

  return (
    <div
      ref={bindRef}
      data-edit-node-id={node.id}
      data-edit-field="text"
      className="wb-shape-node-label"
      style={style}
    >
      {text}
    </div>
  )
}

const ShapeNodeRenderer = (
  props: NodeRenderProps
) => {
  const {
    kind,
    fill,
    fillOpacity,
    stroke,
    strokeOpacity,
    strokeDash,
    color,
    strokeWidth,
    fontSize,
    fontWeight,
    fontStyle,
    textAlign
  } = readShapeColors(props)

  return (
    <div className={`wb-shape-node wb-shape-node-${kind}`}>
      <ShapeGlyph
        kind={kind}
        width="100%"
        height="100%"
        className="wb-shape-node-svg"
        fill={fill}
        fillOpacity={fillOpacity}
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeDash={strokeDash}
        strokeWidth={strokeWidth}
      />
      <ShapeLabel
        {...props}
        kind={kind}
        color={color}
        fontSize={fontSize}
        fontWeight={fontWeight}
        fontStyle={fontStyle}
        textAlign={textAlign}
      />
    </div>
  )
}

export const ShapeNodeDefinition: NodeDefinition = {
  type: 'shape',
  meta: {
    name: 'Shape',
    family: 'shape',
    icon: 'shape',
    controls: ['fill', 'stroke', 'text']
  },
  describe: (node) => readShapeMeta(node),
  defaultData: {
    kind: 'rect',
    text: 'Rectangle'
  },
  role: 'content',
  geometry: 'shape',
  schema: shapeSchema,
  enter: true,
  edit: {
    fields: {
      text: {
        tools: ['size', 'weight', 'italic', 'color', 'align'],
        multiline: true,
        empty: 'keep',
        measure: 'none'
      }
    }
  },
  render: (props) => <ShapeNodeRenderer {...props} />,
  style: () => ({
    border: 'none',
    boxShadow: 'none',
    background: 'transparent',
    borderRadius: 0
  })
}
