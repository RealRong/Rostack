import {
  useCallback,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import type { NodeDefinition, NodeRenderProps } from '#react/types/node'
import {
  useEdit,
  useEditor
} from '#react/runtime/hooks'
import { EditableSlot } from '#react/features/edit/EditableSlot'
import { matchNodeEdit } from '#react/features/edit/session'
import { useStickyFontSize } from '../../hooks/useStickyFontSize'
import {
  bindNodeTextSource,
  readTextWidthMode,
  readTextWrapWidth,
  STICKY_DEFAULT_FILL,
  STICKY_PLACEHOLDER,
  TEXT_DEFAULT_FONT_SIZE,
  TEXT_PLACEHOLDER
} from '../../text'
import {
  createSchema,
  createTextField,
  getStyleNumber,
  getStyleString,
  styleField
} from './shared'

const textSchema = createSchema('text', 'Text', [
  createTextField('text'),
  styleField('fill', 'Background', 'color'),
  styleField('color', 'Text color', 'color'),
  styleField('fontSize', 'Font size', 'number', { min: 8, step: 1 }),
  styleField('fontWeight', 'Font weight', 'number', { min: 100, max: 900, step: 100 }),
  styleField('fontStyle', 'Font style', 'string')
])

const stickySchema = createSchema('sticky', 'Sticky', [
  createTextField('text'),
  styleField('fill', 'Fill', 'color'),
  styleField('color', 'Text color', 'color'),
  styleField('fontSize', 'Font size', 'number', { min: 8, step: 1 }),
  styleField('fontWeight', 'Font weight', 'number', { min: 100, max: 900, step: 100 }),
  styleField('fontStyle', 'Font style', 'string'),
  styleField('stroke', 'Stroke', 'color'),
  styleField('strokeWidth', 'Stroke width', 'number', { min: 0, step: 1 })
])

const readStickyFill = (
  node: NodeRenderProps['node']
) => typeof node.style?.fill === 'string'
  ? node.style.fill
  : STICKY_DEFAULT_FILL

const useElementBinding = <
  TElement extends HTMLDivElement
>() => {
  const ref = useRef<TElement | null>(null)
  const [element, setElement] = useState<TElement | null>(null)

  const bind = useCallback((next: TElement | null) => {
    if (ref.current === next) {
      return
    }

    ref.current = next
    setElement(next)
  }, [])

  return {
    ref,
    element,
    bind
  }
}

const useNodeTextSourceBinding = (
  nodeId: NodeRenderProps['node']['id']
) => {
  const editor = useEditor()
  const {
    ref: sourceRef,
    element: sourceElement,
    bind: bindElement
  } = useElementBinding<HTMLDivElement>()

  const bindRef = useCallback((element: HTMLDivElement | null) => {
    bindNodeTextSource({
      editor,
      nodeId,
      field: 'text',
      current: sourceRef.current,
      next: element
    })
    bindElement(element)
  }, [bindElement, editor, nodeId])

  return {
    sourceRef,
    sourceElement,
    bindRef
  }
}

const TextNodeRenderer = ({
  node,
  rect,
  selected
}: NodeRenderProps) => {
  const edit = useEdit()
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const placeholder = TEXT_PLACEHOLDER
  const {
    bindRef
  } = useNodeTextSourceBinding(node.id)
  const fontSize = getStyleNumber(node, 'fontSize') ?? TEXT_DEFAULT_FONT_SIZE
  const fontWeight = getStyleNumber(node, 'fontWeight') ?? 400
  const fontStyle = getStyleString(node, 'fontStyle') ?? 'normal'
  const color = getStyleString(node, 'color') ?? 'var(--ui-text-primary)'
  const nodeEdit = matchNodeEdit(edit, node.id, 'text')
  const editing = nodeEdit !== null
  const widthMode = readTextWidthMode(node)
  const wrapWidth = readTextWrapWidth(node)
  const textStyle: CSSProperties = {
    fontSize,
    fontWeight,
    fontStyle,
    color,
    opacity: selected ? 1 : 0.9
  }

  return (
    <div className="wb-text-node-viewport">
      <div className="wb-text-node-content">
        {editing ? (
          <EditableSlot
            bindRef={bindRef}
            value={nodeEdit.draft.text}
            caret={nodeEdit.caret}
            multiline
            className="wb-default-text-editor"
            style={textStyle}
            measure={{
              node,
              baseWidth: widthMode === 'wrap'
                ? (wrapWidth ?? rect.width)
                : rect.width,
              placeholder,
              maxWidth: widthMode === 'wrap'
                ? (wrapWidth ?? rect.width)
                : undefined,
              fontSize
            }}
          />
        ) : (
          <div
            ref={bindRef}
            data-edit-node-id={node.id}
            data-edit-field="text"
            className="wb-default-text-display"
            style={textStyle}
          >
            {text || placeholder}
          </div>
        )}
      </div>
    </div>
  )
}

const StickyNodeRenderer = ({
  node,
  rect,
  selected
}: NodeRenderProps) => {
  const edit = useEdit()
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const placeholder = STICKY_PLACEHOLDER
  const {
    sourceElement,
    bindRef
  } = useNodeTextSourceBinding(node.id)
  const {
    element: frameElement,
    bind: bindFrame
  } = useElementBinding<HTMLDivElement>()
  const autoFontSize = useStickyFontSize({
    text,
    rect,
    source: sourceElement,
    frame: frameElement
  })
  const fontSize = getStyleNumber(node, 'fontSize') ?? autoFontSize
  const fontWeight = getStyleNumber(node, 'fontWeight') ?? 400
  const fontStyle = getStyleString(node, 'fontStyle') ?? 'normal'
  const color = getStyleString(node, 'color') ?? 'var(--ui-text-primary)'
  const nodeEdit = matchNodeEdit(edit, node.id, 'text')
  const editing = nodeEdit !== null
  const textStyle: CSSProperties = {
    fontSize,
    fontWeight,
    fontStyle,
    color,
    opacity: text ? 1 : selected ? 1 : 0.72
  }

  return (
    <div className="wb-sticky-node">
      <div
        ref={bindFrame}
        className="wb-sticky-node-shell"
      >
        {editing ? (
          <EditableSlot
            bindRef={bindRef}
            value={nodeEdit.draft.text}
            caret={nodeEdit.caret}
            multiline
            className="wb-sticky-node-text wb-default-text-editor"
            style={textStyle}
          />
        ) : (
          <div
            ref={bindRef}
            data-edit-node-id={node.id}
            data-edit-field="text"
            className="wb-sticky-node-text"
            style={textStyle}
          >
            {text || placeholder}
          </div>
        )}
      </div>
    </div>
  )
}

const createTextStyle = (variant: 'text' | 'sticky') => (props: NodeRenderProps): CSSProperties => {
  const isSticky = variant === 'sticky'
  if (!isSticky) {
    return {
      background: getStyleString(props.node, 'fill') ?? 'transparent',
      border: 'none',
      borderRadius: 0,
      boxShadow: 'none',
      boxSizing: 'border-box',
      display: 'block',
      overflow: 'hidden',
      padding: 0,
      textAlign: 'left'
    }
  }

  return {
    '--wb-sticky-fill': readStickyFill(props.node),
    background:
      'linear-gradient(180deg, rgb(from var(--ui-surface) r g b / 0.16) 0%, rgb(from var(--ui-surface) r g b / 0) 18%, rgb(from var(--ui-text-primary) r g b / 0.04) 100%), var(--wb-sticky-fill, var(--ui-yellow-surface))',
    border: 'none',
    boxSizing: 'border-box',
    borderRadius: 0,
    boxShadow: 'inset 0 1px 0 rgb(from var(--ui-surface) r g b / 0.18), inset 0 -1px 0 rgb(from var(--ui-text-primary) r g b / 0.04)',
    display: 'block',
    isolation: 'isolate',
    overflow: 'visible',
    padding: 0,
    textAlign: 'left'
  } as CSSProperties
}

export const TextNodeDefinition: NodeDefinition = {
  type: 'text',
  meta: {
    name: 'Text',
    family: 'text',
    icon: 'text',
    controls: ['text', 'fill']
  },
  role: 'content',
  geometry: 'rect',
  schema: textSchema,
  defaultData: { text: '' },
  enter: true,
  edit: {
    fields: {
      text: {
        placeholder: TEXT_PLACEHOLDER,
        multiline: true,
        empty: 'keep',
        measure: 'text'
      }
    }
  },
  render: (props) => <TextNodeRenderer {...props} />,
  style: createTextStyle('text')
}

export const StickyNodeDefinition: NodeDefinition = {
  type: 'sticky',
  meta: {
    name: 'Sticky',
    family: 'text',
    icon: 'sticky',
    controls: ['fill', 'text']
  },
  role: 'content',
  geometry: 'rect',
  schema: stickySchema,
  defaultData: { text: '' },
  enter: true,
  edit: {
    fields: {
      text: {
        placeholder: STICKY_PLACEHOLDER,
        multiline: true,
        empty: 'keep',
        measure: 'none'
      }
    }
  },
  render: (props) => <StickyNodeRenderer {...props} />,
  style: createTextStyle('sticky')
}
