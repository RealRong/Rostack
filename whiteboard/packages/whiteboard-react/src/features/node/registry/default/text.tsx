import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties
} from 'react'
import { isSizeEqual } from '@whiteboard/core/geometry'
import { WHITEBOARD_TEXT_DEFAULT_COLOR } from '@whiteboard/core/node'
import type { NodeDefinition, NodeRenderProps } from '@whiteboard/react/types/node'
import {
  useEdit,
  useEditor
} from '@whiteboard/react/runtime/hooks'
import { EditableSlot } from '@whiteboard/react/features/edit/EditableSlot'
import { matchNodeEdit } from '@whiteboard/react/features/edit/session'
import { useStickyFontSize } from '@whiteboard/react/features/node/hooks/useStickyFontSize'
import {
  bindNodeTextSource,
  measureTextNodeSize,
  type TextWidthMode,
  readTextWidthMode,
  readTextWrapWidth,
  STICKY_DEFAULT_FILL,
  STICKY_DEFAULT_TEXT_COLOR,
  TEXT_DEFAULT_FONT_SIZE,
  TEXT_PLACEHOLDER
} from '@whiteboard/react/features/node/text'
import { resolvePaletteColorOr } from '@whiteboard/react/features/palette'
import {
  createSchema,
  createTextField,
  getStyleNumber,
  getStyleString,
  styleField
} from '@whiteboard/react/features/node/registry/default/shared'

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
) => resolvePaletteColorOr(
  getStyleString(node, 'fill'),
  STICKY_DEFAULT_FILL
) ?? STICKY_DEFAULT_FILL

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

export const resolveTextMeasureInput = ({
  node,
  rect,
  placeholder,
  fontSize,
  widthMode,
  wrapWidth
}: {
  node: NodeRenderProps['node']
  rect: Pick<NodeRenderProps['rect'], 'width'>
  placeholder: string
  fontSize: number
  widthMode?: TextWidthMode
  wrapWidth?: number
}) => {
  const resolvedWidthMode = widthMode ?? readTextWidthMode(node)
  const resolvedWrapWidth = resolvedWidthMode === 'wrap'
    ? (wrapWidth ?? readTextWrapWidth(node) ?? rect.width)
    : undefined
  const baseWidth = resolvedWidthMode === 'wrap'
    ? (resolvedWrapWidth ?? rect.width)
    : rect.width

  return {
    node,
    baseWidth,
    placeholder,
    minWidth: resolvedWidthMode === 'wrap'
      ? baseWidth
      : undefined,
    maxWidth: resolvedWidthMode === 'wrap'
      ? baseWidth
      : undefined,
    fontSize,
    widthMode: resolvedWidthMode,
    wrapWidth: resolvedWrapWidth
  }
}

export const resolveTextLayoutStyle = ({
  widthMode,
  wrapWidth
}: {
  widthMode: TextWidthMode
  wrapWidth?: number
}): CSSProperties => {
  if (widthMode !== 'wrap' || typeof wrapWidth !== 'number') {
    return {}
  }

  return {
    width: wrapWidth,
    minWidth: wrapWidth,
    maxWidth: wrapWidth
  }
}

const useSyncedTextNodeSize = ({
  node,
  rect,
  source,
  content,
  placeholder,
  fontSize,
  editing
}: {
  node: NodeRenderProps['node']
  rect: NodeRenderProps['rect']
  source: HTMLDivElement | null
  content: string
  placeholder: string
  fontSize: number
  editing: boolean
}) => {
  const editor = useEditor()
  const pendingSizeRef = useRef<{
    width: number
    height: number
  } | null>(null)

  useLayoutEffect(() => {
    if (!source?.isConnected || editing) {
      return
    }

    const measure = resolveTextMeasureInput({
      node,
      rect,
      placeholder,
      fontSize
    })
    const currentSize = {
      width: rect.width,
      height: rect.height
    }
    if (pendingSizeRef.current && isSizeEqual(pendingSizeRef.current, currentSize)) {
      pendingSizeRef.current = null
    }

    const measuredSize = measureTextNodeSize({
      node: measure.node,
      rect: {
        width: measure.baseWidth
      },
      content,
      placeholder: measure.placeholder,
      source,
      minWidth: measure.minWidth,
      maxWidth: measure.maxWidth,
      fontSize: measure.fontSize,
      widthMode: measure.widthMode,
      wrapWidth: measure.wrapWidth
    })

    if (
      !measuredSize
      || isSizeEqual(measuredSize, currentSize)
      || (pendingSizeRef.current && isSizeEqual(pendingSizeRef.current, measuredSize))
    ) {
      return
    }

    pendingSizeRef.current = measuredSize
    editor.actions.node.patch([node.id], {
      fields: {
        size: measuredSize
      }
    }, {
      origin: 'system'
    })
  }, [
    content,
    editing,
    editor.actions.node,
    fontSize,
    node,
    placeholder,
    rect,
    source
  ])
}

const TextNodeRenderer = ({
  node,
  rect
}: NodeRenderProps) => {
  const edit = useEdit()
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const placeholder = TEXT_PLACEHOLDER
  const {
    sourceElement,
    bindRef
  } = useNodeTextSourceBinding(node.id)
  const fontSize = getStyleNumber(node, 'fontSize') ?? TEXT_DEFAULT_FONT_SIZE
  const fontWeight = getStyleNumber(node, 'fontWeight') ?? 400
  const fontStyle = getStyleString(node, 'fontStyle') ?? 'normal'
  const color = resolvePaletteColorOr(
    getStyleString(node, 'color'),
    WHITEBOARD_TEXT_DEFAULT_COLOR
  ) ?? 'var(--ui-text-primary)'
  const nodeEdit = matchNodeEdit(edit, node.id, 'text')
  const editing = nodeEdit !== null
  const widthMode = editing
    ? (
        nodeEdit.layout.wrapWidth !== undefined
          ? 'wrap'
          : readTextWidthMode(node)
      )
    : readTextWidthMode(node)
  const wrapWidth = editing
    ? (nodeEdit.layout.wrapWidth ?? readTextWrapWidth(node))
    : readTextWrapWidth(node)
  const textLayoutStyle = resolveTextLayoutStyle({
    widthMode,
    wrapWidth
  })
  const textStyle: CSSProperties = {
    fontSize,
    fontWeight,
    fontStyle,
    color,
    ...textLayoutStyle
  }
  const measure = resolveTextMeasureInput({
    node,
    rect,
    placeholder,
    fontSize,
    widthMode,
    wrapWidth
  })

  useSyncedTextNodeSize({
    node,
    rect,
    source: sourceElement,
    content: text,
    placeholder,
    fontSize,
    editing
  })

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
            measure={measure}
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
  const color = resolvePaletteColorOr(
    getStyleString(node, 'color'),
    STICKY_DEFAULT_TEXT_COLOR
  ) ?? 'var(--ui-text-primary)'
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
            {text}
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
    background: 'var(--wb-sticky-fill, var(--wb-palette-sticky-13))',
    border: 'none',
    boxSizing: 'border-box',
    borderRadius: 0,
    boxShadow: 'none',
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
        placeholder: '',
        multiline: true,
        empty: 'keep',
        measure: 'none'
      }
    }
  },
  render: (props) => <StickyNodeRenderer {...props} />,
  style: createTextStyle('sticky')
}
