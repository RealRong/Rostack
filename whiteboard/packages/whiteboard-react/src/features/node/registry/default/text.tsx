import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { NodeDefinition, NodeRenderProps } from '../../../../types/node'
import { useEdit, useEditor } from '../../../../runtime/hooks/useEditor'
import { useOptionalKeyedStoreValue } from '../../../../runtime/hooks/useStoreValue'
import {
  focusEditableDraft,
  isEscapeEditingKey,
  isSubmitEditingKey,
  stopEditingPointerDown,
  syncEditableDraft
} from '../../dom/editableText'
import { useStickyFontSize } from '../../hooks/useStickyFontSize'
import {
  bindNodeTextSource,
  measureTextNodeSize,
  readEditableText,
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

const EMPTY_NODE_STATE = {
  hovered: false,
  hidden: false,
  patched: false,
  resizing: false
}

const SIZE_EPSILON = 0.5

const isSameSize = (
  left: { width: number; height: number } | undefined,
  right: { width: number; height: number } | undefined
) => (
  Math.abs((left?.width ?? 0) - (right?.width ?? 0)) < SIZE_EPSILON
  && Math.abs((left?.height ?? 0) - (right?.height ?? 0)) < SIZE_EPSILON
)

const textSchema = createSchema('text', 'Text', [
  createTextField('text'),
  styleField('color', 'Text color', 'color'),
  styleField('fontSize', 'Font size', 'number', { min: 8, step: 1 })
])

const stickySchema = createSchema('sticky', 'Sticky', [
  createTextField('text'),
  styleField('fill', 'Fill', 'color'),
  styleField('color', 'Text color', 'color'),
  styleField('stroke', 'Stroke', 'color'),
  styleField('strokeWidth', 'Stroke width', 'number', { min: 0, step: 1 })
])

const readStickyFill = (
  node: NodeRenderProps['node']
) => (
  typeof node.style?.fill === 'string'
    ? node.style.fill
    : (
        node.data && typeof node.data.background === 'string'
          ? node.data.background
          : STICKY_DEFAULT_FILL
      )
)

const TextNodeRenderer = ({
  node,
  rect,
  selected,
  variant
}: NodeRenderProps & { variant: 'text' | 'sticky' }) => {
  const editor = useEditor()
  const edit = useEdit()
  const editing = edit?.nodeId === node.id && edit.field === 'text'
  const editCaret = editing ? edit.caret : undefined
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const [draft, setDraft] = useState(text)
  const isSticky = variant === 'sticky'
  const sourceRef = useRef<HTMLDivElement | null>(null)
  const nodeState = useOptionalKeyedStoreValue(
    editor.read.node.state,
    node.id,
    EMPTY_NODE_STATE
  )
  const setSourceRef = (element: HTMLDivElement | null) => {
    bindNodeTextSource({
      editor,
      nodeId: node.id,
      field: 'text',
      current: sourceRef.current,
      next: element
    })
    sourceRef.current = element
  }
  const placeholder = isSticky ? STICKY_PLACEHOLDER : TEXT_PLACEHOLDER
  const stickyFontSize = useStickyFontSize({
    text: editing ? draft : text,
    rect,
    sourceRef
  })
  const fontSize = isSticky
    ? stickyFontSize
    : (getStyleNumber(node, 'fontSize') ?? TEXT_DEFAULT_FONT_SIZE)
  const color = getStyleString(node, 'color') ?? 'var(--ui-text-primary)'

  useEffect(() => {
    setDraft(text)
  }, [text])

  useEffect(() => {
    if (!editing) {
      return
    }

    const element = sourceRef.current
    if (!element) {
      return
    }

    syncEditableDraft(element, draft)
  }, [draft, editing])

  useEffect(() => {
    if (!editing) {
      return
    }

    const element = sourceRef.current
    if (!element) {
      return
    }

    return focusEditableDraft(element, editCaret)
  }, [editCaret, editing])

  useLayoutEffect(() => {
    if (!editing || isSticky) {
      editor.commands.node.text.clearPreview(node.id)
      return
    }

    const source = sourceRef.current
    if (!source) {
      return
    }

    const size = measureTextNodeSize({
      node,
      rect,
      content: draft,
      placeholder,
      source,
      minWidth: rect.width
    })
    if (!size) {
      return
    }

    editor.commands.node.text.preview({
      nodeId: node.id,
      size
    })
  }, [draft, editing, editor, isSticky, node.id])

  useEffect(() => () => {
    editor.commands.node.text.clearPreview(node.id)
  }, [editor, node.id])

  useLayoutEffect(() => {
    if (editing || isSticky) {
      return
    }

    const source = sourceRef.current
    if (!source) {
      return
    }

    const size = measureTextNodeSize({
      node,
      rect,
      content: text,
      placeholder,
      source
    })
    if (!size) {
      return
    }

    if (nodeState.resizing) {
      const nextSize = {
        width: rect.width,
        height: size.height
      }

      if (isSameSize(nextSize, rect)) {
        editor.commands.node.text.clearPreview(node.id)
        return
      }

      editor.commands.node.text.preview({
        nodeId: node.id,
        size: nextSize
      })
      return
    }

    editor.commands.node.text.clearPreview(node.id)

    if (isSameSize(size, rect)) {
      return
    }

    editor.commands.node.document.update(node.id, {
      fields: {
        size
      }
    })
  }, [
    editing,
    editor,
    isSticky,
    node,
    node.id,
    nodeState.resizing,
    placeholder,
    rect,
    text
  ])

  const commit = (
    nextDraft = draft,
    source: HTMLElement | null = sourceRef.current
  ) => {
    const size = !isSticky && source
      ? measureTextNodeSize({
          node,
          rect,
          content: nextDraft,
          placeholder,
          source
        })
      : undefined

    editor.commands.node.text.commit({
      nodeId: node.id,
      field: 'text',
      value: nextDraft,
      size
    })
  }

  const cancel = () => {
    setDraft(text)
    editor.commands.node.text.cancel({
      nodeId: node.id
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

  if (editing) {
    return (
      <div
        data-selection-ignore
        data-input-ignore
        className={`wb-default-text-display wb-default-text-editor${isSticky ? ' wb-sticky-content' : ''}`}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        spellCheck={false}
        ref={setSourceRef}
        onPointerDown={stopEditingPointerDown}
        onInput={(event) => {
          setDraft(readEditableText(event.currentTarget))
        }}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          commit(readEditableText(event.currentTarget), event.currentTarget)
        }}
        style={{
          fontSize,
          color
        } as CSSProperties}
      />
    )
  }

  return (
      <div
        className={`wb-default-text-display${isSticky ? ' wb-sticky-content' : ''}`}
        ref={setSourceRef}
        style={{
          fontSize,
        color,
        opacity: selected ? 1 : 0.9
      }}
    >
      {text || placeholder}
    </div>
  )
}

const createTextStyle = (variant: 'text' | 'sticky') => (props: NodeRenderProps): CSSProperties => {
  const isSticky = variant === 'sticky'
  if (!isSticky) {
    return {
      background: 'transparent',
      border: 'none',
      borderRadius: 0,
      boxShadow: 'none',
      boxSizing: 'border-box',
      display: 'block',
      overflow: 'visible',
      padding: 0,
      textAlign: 'left'
    }
  }

  return {
    '--wb-sticky-fill': readStickyFill(props.node),
    background:
      'linear-gradient(180deg, rgb(from var(--wb-ui-surface) r g b / 0.16) 0%, rgb(from var(--wb-ui-surface) r g b / 0) 18%, rgb(from var(--wb-ui-text-primary) r g b / 0.04) 100%), var(--wb-sticky-fill, var(--ui-yellow-bg-strong))',
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
    controls: ['text']
  },
  role: 'content',
  geometry: 'rect',
  schema: textSchema,
  defaultData: { text: '' },
  enter: true,
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
  render: (props) => <TextNodeRenderer {...props} variant="sticky" />,
  style: createTextStyle('sticky')
}
