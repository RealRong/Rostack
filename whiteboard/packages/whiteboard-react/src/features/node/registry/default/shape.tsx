import {
  readShapeKind,
  readShapeMeta,
  readShapeSpec
} from '@whiteboard/core/node'
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent
} from 'react'
import type { NodeDefinition, NodeRenderProps } from '#react/types/node'
import { useEdit, useEditor, usePickRef } from '#react/runtime/hooks'
import {
  focusEditableDraft,
  isEscapeEditingKey,
  isSubmitEditingKey,
  stopEditingPointerDown,
  syncEditableDraft
} from '../../dom/editableText'
import {
  ShapeGlyph
} from '../../shape'
import {
  readEditableText,
  TEXT_DEFAULT_FONT_SIZE
} from '../../text'
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
  kind,
  write
}: NodeRenderProps & {
  kind: ReturnType<typeof readShapeKind>
  color: string
  fontSize: number
  fontWeight: number
  fontStyle: string
  textAlign: string
}) => {
  const editor = useEditor()
  const edit = useEdit()
  const editing = edit?.kind === 'node' && edit.nodeId === node.id && edit.field === 'text'
  const editCaret = editing ? edit.caret : undefined
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const [draft, setDraft] = useState(text)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const labelRef = usePickRef({
    kind: 'node',
    id: node.id,
    part: 'body'
  })

  useEffect(() => {
    setDraft(text)
  }, [text])

  useEffect(() => {
    if (!editing) {
      return
    }

    const element = editorRef.current
    if (!element) {
      return
    }

    syncEditableDraft(element, draft)
  }, [draft, editing])

  useEffect(() => {
    if (!editing) {
      return
    }

    const element = editorRef.current
    if (!element) {
      return
    }

    return focusEditableDraft(element, editCaret)
  }, [editCaret, editing])

  const cancel = () => {
    setDraft(text)
    editor.commands.node.text.cancel({
      nodeId: node.id
    })
  }

  const commit = (value = draft) => {
    editor.commands.node.text.commit({
      nodeId: node.id,
      field: 'text',
      value
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isEscapeEditingKey(event)) {
      event.preventDefault()
      cancel()
      return
    }

    if (isSubmitEditingKey(event)) {
      event.preventDefault()
      commit(readEditableText(event.currentTarget))
    }
  }

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
    opacity: editing || text ? 1 : 0.48
  }

  if (editing) {
    return (
      <div
        ref={editorRef}
        className="wb-shape-node-label wb-shape-node-editor"
        data-selection-ignore
        data-input-ignore
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        spellCheck={false}
        onPointerDown={stopEditingPointerDown}
        onInput={(event) => {
          setDraft(readEditableText(event.currentTarget))
        }}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          commit(readEditableText(event.currentTarget))
        }}
        style={style}
      />
    )
  }

  return (
    <div
      ref={labelRef}
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
  render: (props) => <ShapeNodeRenderer {...props} />,
  style: () => ({
    border: 'none',
    boxShadow: 'none',
    background: 'transparent',
    borderRadius: 0
  })
}
