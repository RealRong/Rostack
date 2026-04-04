import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import type { NodeDefinition, NodeRenderProps } from '../../../../types/node'
import { useEdit, useEditor } from '../../../../runtime/hooks/useEditor'
import { useAutoFontSize } from '../../hooks/useAutoFontSize'
import {
  bindNodeTextSource,
  focusEditableEnd,
  measureTextNodeSize,
  readEditableText,
  STICKY_DEFAULT_FILL,
  STICKY_PLACEHOLDER,
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
  styleField('color', 'Text color', 'color'),
  styleField('fontSize', 'Font size', 'number', { min: 8, step: 1 })
])

const stickySchema = createSchema('sticky', 'Sticky', [
  createTextField('text'),
  styleField('fill', 'Fill', 'color'),
  styleField('color', 'Text color', 'color'),
  styleField('fontSize', 'Font size', 'number', { min: 8, step: 1 }),
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
  write,
  node,
  rect,
  selected,
  variant
}: NodeRenderProps & { variant: 'text' | 'sticky' }) => {
  const editor = useEditor()
  const edit = useEdit()
  const editing = edit?.nodeId === node.id && edit.field === 'text'
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const [draft, setDraft] = useState(text)
  const isSticky = variant === 'sticky'
  const sourceRef = useRef<HTMLDivElement | null>(null)
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
  const manualFontSize = getStyleNumber(node, 'fontSize')
  const placeholder = isSticky ? STICKY_PLACEHOLDER : TEXT_PLACEHOLDER
  const displayFontSize = useAutoFontSize({
    text,
    placeholder,
    rect,
    variant,
    manualFontSize,
    sourceRef
  })
  const [editingFontSize, setEditingFontSize] = useState<number | null>(null)
  const fontSize = isSticky && editing
    ? (editingFontSize ?? displayFontSize)
    : displayFontSize
  const color = getStyleString(node, 'color') ?? 'var(--ui-text-primary)'

  useEffect(() => {
    setDraft(text)
  }, [text])

  useEffect(() => {
    if (!isSticky || !editing) {
      setEditingFontSize(null)
      return
    }

    setEditingFontSize((current) => current ?? displayFontSize)
  }, [displayFontSize, editing, isSticky])

  useEffect(() => {
    if (!editing) {
      return
    }

    const element = sourceRef.current
    if (!element) {
      return
    }

    if (readEditableText(element) !== draft) {
      element.textContent = draft
    }
  }, [draft, editing])

  useEffect(() => {
    if (!editing) {
      return
    }

    const element = sourceRef.current
    if (!element) {
      return
    }

    if (readEditableText(element) !== draft) {
      element.textContent = draft
    }

    const frame = requestAnimationFrame(() => {
      focusEditableEnd(element)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [editing])

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
    if (event.key === 'Escape') {
      event.preventDefault()
      cancel()
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
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
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
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
      data-node-editable-field="text"
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
  schema: textSchema,
  defaultData: { text: '' },
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
  schema: stickySchema,
  defaultData: { text: '' },
  render: (props) => <TextNodeRenderer {...props} variant="sticky" />,
  style: createTextStyle('sticky')
}
