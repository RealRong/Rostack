import { node as nodeApi } from '@whiteboard/core/node'
import { product } from '@whiteboard/product'
import { useCallback, useRef, type CSSProperties } from 'react'
import type { NodeRenderProps, NodeSpecEntry } from '@whiteboard/react/types/node'
import { EditableSlot } from '@whiteboard/react/features/edit/EditableSlot'
import { useWhiteboardServices } from '@whiteboard/react/runtime/hooks'
import { resolvePaletteColorOr } from '@whiteboard/react/features/palette'
import {
  ShapeGlyph
} from '@whiteboard/react/features/node/shape'
import { TEXT_DEFAULT_FONT_SIZE } from '@whiteboard/react/features/node/text'
import {
  getStyleNumberArray,
  getStyleNumber,
  getStyleString
} from '@whiteboard/react/features/node/registry/default/shared'

const shapeSchema = {
  fields: {
    'style.fillOpacity': {
      label: 'Fill opacity',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.05
    },
    'data.text': {
      label: 'Text',
      type: 'text'
    },
    'style.fill': {
      label: 'Fill',
      type: 'color'
    },
    'style.stroke': {
      label: 'Stroke',
      type: 'color'
    },
    'style.strokeWidth': {
      label: 'Stroke width',
      type: 'number',
      min: 0,
      step: 1
    },
    'style.strokeOpacity': {
      label: 'Stroke opacity',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.05
    },
    'style.strokeDash': {
      label: 'Stroke dash',
      type: 'string',
      kind: 'numberArray'
    },
    'style.color': {
      label: 'Text color',
      type: 'color'
    },
    'style.fontSize': {
      label: 'Font size',
      type: 'number',
      min: 8,
      step: 1
    },
    'style.fontWeight': {
      label: 'Font weight',
      type: 'number',
      min: 100,
      max: 900,
      step: 100
    },
    'style.fontStyle': {
      label: 'Font style',
      type: 'string'
    },
    'style.textAlign': {
      label: 'Text align',
      type: 'string'
    }
  }
} as const

const readShapeColors = (
  props: NodeRenderProps
) => {
  const kind = nodeApi.shape.kind(props.node)
  const spec = product.node.shapes.getWhiteboardShapeSpec(kind)

  return {
    kind,
    fill: resolvePaletteColorOr(
      getStyleString(props.node, 'fill'),
      spec.defaults.fill
    ) ?? spec.defaults.fill,
    fillOpacity: getStyleNumber(props.node, 'fillOpacity') ?? 1,
    stroke: resolvePaletteColorOr(
      getStyleString(props.node, 'stroke'),
      spec.defaults.stroke
    ) ?? spec.defaults.stroke,
    strokeOpacity: getStyleNumber(props.node, 'strokeOpacity') ?? 1,
    strokeDash: getStyleNumberArray(props.node, 'strokeDash'),
    color: resolvePaletteColorOr(
      getStyleString(props.node, 'color'),
      spec.defaults.color
    ) ?? spec.defaults.color,
    strokeWidth: getStyleNumber(props.node, 'strokeWidth') ?? (props.hovered ? 1.6 : 1.2),
    fontSize: getStyleNumber(props.node, 'fontSize') ?? TEXT_DEFAULT_FONT_SIZE,
    fontWeight: getStyleNumber(props.node, 'fontWeight') ?? 400,
    fontStyle: getStyleString(props.node, 'fontStyle') ?? 'normal',
    textAlign: getStyleString(props.node, 'textAlign') ?? 'center'
  }
}

const ShapeLabel = ({
  node,
  edit,
  color,
  fontSize,
  fontWeight,
  fontStyle,
  textAlign,
  kind
}: NodeRenderProps & {
  kind: ReturnType<typeof nodeApi.shape.kind>
  color: string
  fontSize: number
  fontWeight: number
  fontStyle: string
  textAlign: string
}) => {
  const { textSources } = useWhiteboardServices()
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const labelRef = useRef<HTMLDivElement | null>(null)
  const source = {
    kind: 'node' as const,
    nodeId: node.id,
    field: 'text' as const
  }
  const bindRef = useCallback((element: HTMLDivElement | null) => {
    if (labelRef.current === element) {
      return
    }

    if (labelRef.current) {
      textSources.set(source, null)
    }

    textSources.set(source, element)
    labelRef.current = element
  }, [source, textSources])

  const shellStyle: CSSProperties = {
    ...nodeApi.shape.descriptor(kind).labelInset,
    justifyContent:
      textAlign === 'left'
        ? 'flex-start'
        : textAlign === 'right'
          ? 'flex-end'
          : 'center'
  }
  const contentStyle: CSSProperties = {
    color,
    fontSize,
    fontWeight,
    fontStyle,
    textAlign: textAlign as CSSProperties['textAlign'],
    opacity: text ? 1 : 0.48
  }
  const editing = edit?.field === 'text'

  return (
    <div
      className="wb-shape-node-label-shell"
      style={shellStyle}
    >
      {editing ? (
        <EditableSlot
          bindRef={bindRef}
          value={text}
          caret={edit.caret}
          multiline
          className="wb-shape-node-label-content wb-default-text-editor"
          style={contentStyle}
        />
      ) : (
          <div
            ref={bindRef}
            data-edit-node-id={node.id}
            data-edit-field="text"
            className="wb-shape-node-label-content"
            style={contentStyle}
          >
            {text}
          </div>
        )}
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

export const ShapeNodeSpec: NodeSpecEntry = {
  meta: {
    type: 'shape',
    name: 'Shape',
    family: 'shape',
    icon: 'shape',
    controls: ['fill', 'stroke', 'text']
  },
  schema: shapeSchema,
  behavior: {
    defaultData: {
      kind: 'rect',
      text: 'Rectangle'
    },
    role: 'content',
    geometry: 'shape',
    enter: true,
    edit: {
      fields: {
        text: {
          multiline: true,
          empty: 'keep'
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
}
