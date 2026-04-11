import { useCallback, useRef, type CSSProperties } from 'react'
import type { NodeDefinition, NodeRenderProps } from '#react/types/node'
import {
  useEdit,
  useEditor
} from '#react/runtime/hooks'
import { EditableSlot } from '#react/features/edit/EditableSlot'
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

type TextNodeRendererProps = NodeRenderProps & {
  variant: 'text' | 'sticky'
}

const useNodeTextSourceBinding = (
  nodeId: NodeRenderProps['node']['id']
) => {
  const editor = useEditor()
  const sourceRef = useRef<HTMLDivElement | null>(null)

  const bindRef = useCallback((element: HTMLDivElement | null) => {
    bindNodeTextSource({
      editor,
      nodeId,
      field: 'text',
      current: sourceRef.current,
      next: element
    })
    sourceRef.current = element
  }, [editor, nodeId])

  return {
    sourceRef,
    bindRef
  }
}

const TextNodeRenderer = ({
  node,
  rect,
  selected,
  variant
}: TextNodeRendererProps) => {
  const edit = useEdit()
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const isSticky = variant === 'sticky'
  const placeholder = isSticky ? STICKY_PLACEHOLDER : TEXT_PLACEHOLDER
  const {
    sourceRef,
    bindRef
  } = useNodeTextSourceBinding(node.id)
  const stickyFontSize = useStickyFontSize({
    text,
    rect,
    sourceRef
  })
  const fontSize = getStyleNumber(node, 'fontSize') ?? (
    isSticky
      ? stickyFontSize
      : TEXT_DEFAULT_FONT_SIZE
  )
  const fontWeight = getStyleNumber(node, 'fontWeight') ?? 400
  const fontStyle = getStyleString(node, 'fontStyle') ?? 'normal'
  const color = getStyleString(node, 'color') ?? 'var(--ui-text-primary)'
  const editing =
    edit?.kind === 'node'
    && edit.nodeId === node.id
    && edit.field === 'text'
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
      <div className={`wb-text-node-content${isSticky ? ' wb-sticky-content' : ''}`}>
        {editing ? (
          <EditableSlot
            bindRef={bindRef}
            value={text}
            caret={edit.caret}
            multiline
            className="wb-default-text-editor"
            style={textStyle}
            measure={
              variant === 'text'
                ? {
                    node,
                    baseWidth: widthMode === 'wrap'
                      ? (wrapWidth ?? rect.width)
                      : rect.width,
                    placeholder,
                    maxWidth: widthMode === 'wrap'
                      ? (wrapWidth ?? rect.width)
                      : undefined,
                    fontSize
                  }
                : undefined
            }
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
      'linear-gradient(180deg, rgb(from var(--wb-ui-surface) r g b / 0.16) 0%, rgb(from var(--wb-ui-surface) r g b / 0) 18%, rgb(from var(--wb-ui-text-primary) r g b / 0.04) 100%), var(--wb-sticky-fill, var(--ui-yellow-surface))',
    border: 'none',
    boxSizing: 'border-box',
    borderRadius: 0,
    boxShadow: 'inset 0 1px 0 rgb(from var(--wb-ui-surface) r g b / 0.18), inset 0 -1px 0 rgb(from var(--wb-ui-text-primary) r g b / 0.04)',
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
        tools: ['size', 'weight', 'italic', 'color', 'background'],
        placeholder: TEXT_PLACEHOLDER,
        multiline: true,
        empty: 'keep',
        measure: 'text'
      }
    }
  },
  render: (props) => <TextNodeRenderer {...props} variant="text" />,
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
        tools: ['size', 'weight', 'italic', 'color', 'background'],
        placeholder: STICKY_PLACEHOLDER,
        multiline: true,
        empty: 'keep',
        measure: 'none'
      }
    }
  },
  render: (props) => <TextNodeRenderer {...props} variant="sticky" />,
  style: createTextStyle('sticky')
}
