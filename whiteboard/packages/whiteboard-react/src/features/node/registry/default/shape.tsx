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
import type { NodeDefinition, NodeRenderProps } from '../../../../types/node'
import { useEdit, useEditor } from '../../../../runtime/hooks/useEditor'
import {
  focusEditableDraftEnd,
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
  getStyleNumber,
  getStyleString,
  styleField
} from './shared'

const shapeSchema = createSchema('shape', 'Shape', [
  createTextField('text'),
  styleField('fill', 'Fill', 'color'),
  styleField('stroke', 'Stroke', 'color'),
  styleField('strokeWidth', 'Stroke width', 'number', { min: 0, step: 1 }),
  styleField('color', 'Text color', 'color'),
  styleField('fontSize', 'Font size', 'number', { min: 8, step: 1 })
])

const readShapeColors = (
  props: NodeRenderProps
) => {
  const kind = readShapeKind(props.node)
  const spec = readShapeSpec(kind)

  return {
    kind,
    fill: getStyleString(props.node, 'fill') ?? spec.defaults.fill,
    stroke: getStyleString(props.node, 'stroke') ?? spec.defaults.stroke,
    color: getStyleString(props.node, 'color') ?? spec.defaults.color,
    strokeWidth: getStyleNumber(props.node, 'strokeWidth') ?? (props.hovered ? 1.6 : 1.2),
    fontSize: getStyleNumber(props.node, 'fontSize') ?? TEXT_DEFAULT_FONT_SIZE
  }
}

const ShapeLabel = ({
  node,
  color,
  fontSize,
  kind,
  write
}: NodeRenderProps & {
  kind: ReturnType<typeof readShapeKind>
  color: string
  fontSize: number
}) => {
  const editor = useEditor()
  const edit = useEdit()
  const editing = edit?.nodeId === node.id && edit.field === 'text'
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const [draft, setDraft] = useState(text)
  const editorRef = useRef<HTMLDivElement | null>(null)

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
    return focusEditableDraftEnd(element)
  }, [draft, editing, node.id])

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
    opacity: editing || text ? 1 : 0.48
  }

  if (editing) {
    return (
      <div
        ref={editorRef}
        className="wb-shape-node-label wb-shape-node-editor"
        data-node-editable-field="text"
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
      className="wb-shape-node-label"
      data-node-editable-field="text"
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
    stroke,
    color,
    strokeWidth,
    fontSize
  } = readShapeColors(props)

  return (
    <div className={`wb-shape-node wb-shape-node-${kind}`}>
      <ShapeGlyph
        kind={kind}
        width="100%"
        height="100%"
        className="wb-shape-node-svg"
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      <ShapeLabel
        {...props}
        kind={kind}
        color={color}
        fontSize={fontSize}
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
  render: (props) => <ShapeNodeRenderer {...props} />,
  style: () => ({
    border: 'none',
    boxShadow: 'none',
    background: 'transparent',
    borderRadius: 0
  })
}
