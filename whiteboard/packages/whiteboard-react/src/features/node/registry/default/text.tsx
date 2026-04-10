import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import {
  estimateTextAutoFont,
  isTextContentEmpty
} from '@whiteboard/core/node'
import { useStoreValue } from '@shared/react'
import type { NodeDefinition, NodeRenderProps } from '#react/types/node'
import {
  useEdit,
  useEditor
} from '#react/runtime/hooks'
import {
  focusEditableDraft,
  isEscapeEditingKey,
  isSubmitEditingKey,
  stopEditingPointerDown,
  syncEditableDraft
} from '../../dom/editableText'
import { useStickyFontSize } from '../../hooks/useStickyFontSize'
import { toNodeDataPatch } from '../../update'
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

const SIZE_EPSILON = 0.5

const textSchema = createSchema('text', 'Text', [
  createTextField('text'),
  styleField('fill', 'Background', 'color'),
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
) => typeof node.style?.fill === 'string'
  ? node.style.fill
  : STICKY_DEFAULT_FILL

type TextNodeRendererProps = NodeRenderProps & {
  variant: 'text' | 'sticky'
}

const useNodeTextSourceRef = (
  editor: ReturnType<typeof useEditor>,
  nodeId: NodeRenderProps['node']['id']
) => {
  const sourceRef = useRef<HTMLDivElement | null>(null)

  const setSourceRef = useCallback((element: HTMLDivElement | null) => {
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
    setSourceRef
  }
}

const TextNodeDisplay = ({
  node,
  rect,
  selected,
  variant
}: TextNodeRendererProps) => {
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const isSticky = variant === 'sticky'
  const placeholder = isSticky ? STICKY_PLACEHOLDER : TEXT_PLACEHOLDER
  const fontSize = isSticky
    ? estimateTextAutoFont('sticky', rect)
    : (getStyleNumber(node, 'fontSize') ?? TEXT_DEFAULT_FONT_SIZE)
  const color = getStyleString(node, 'color') ?? 'var(--ui-text-primary)'

  return (
    <div className="wb-text-node-viewport">
      <div
        className={`wb-default-text-display${isSticky ? ' wb-sticky-content' : ''}`}
        style={{
          fontSize,
          color,
          opacity: selected ? 1 : 0.9
        }}
      >
        {text || placeholder}
      </div>
    </div>
  )
}

const TextNodeEditor = ({
  node,
  rect,
  variant
}: TextNodeRendererProps) => {
  const editor = useEditor()
  const edit = useEdit()
  const editing = edit?.kind === 'node' && edit.nodeId === node.id && edit.field === 'text'
  const editCaret = editing ? edit.caret : undefined
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const [draft, setDraft] = useState(text)
  const isSticky = variant === 'sticky'
  const { sourceRef, setSourceRef } = useNodeTextSourceRef(editor, node.id)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const viewport = useStoreValue(editor.select.viewport())
  const [editorRect, setEditorRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const placeholder = isSticky ? STICKY_PLACEHOLDER : TEXT_PLACEHOLDER
  const stickyFontSize = useStickyFontSize({
    text: draft,
    rect,
    sourceRef
  })
  const fontSize = isSticky
    ? stickyFontSize
    : (getStyleNumber(node, 'fontSize') ?? TEXT_DEFAULT_FONT_SIZE)
  const color = getStyleString(node, 'color') ?? 'var(--ui-text-primary)'
  const setAnchorRef = useCallback((element: HTMLDivElement | null) => {
    anchorRef.current = element
  }, [])

  useEffect(() => {
    setDraft((current) => current === text ? current : text)
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
  }, [draft, editing, sourceRef])

  useEffect(() => {
    if (!editing) {
      return
    }

    const element = sourceRef.current
    if (!element) {
      return
    }

    return focusEditableDraft(element, editCaret)
  }, [editCaret, editing, sourceRef])

  useLayoutEffect(() => {
    if (!editing) {
      setEditorRect((current) => current === null ? current : null)
      return
    }

    const updateRect = () => {
      const element = anchorRef.current
      if (!element) {
        setEditorRect((current) => current === null ? current : null)
        return
      }

      const next = element.getBoundingClientRect()
      setEditorRect((current) => (
        current
        && Math.abs(current.left - next.left) < SIZE_EPSILON
        && Math.abs(current.top - next.top) < SIZE_EPSILON
        && Math.abs(current.width - next.width) < SIZE_EPSILON
        && Math.abs(current.height - next.height) < SIZE_EPSILON
          ? current
          : {
              left: next.left,
              top: next.top,
              width: next.width,
              height: next.height
            }
      ))
    }

    updateRect()

    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)

    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [
    editing,
    rect.height,
    rect.width,
    rect.x,
    rect.y,
    viewport.center.x,
    viewport.center.y,
    viewport.zoom
  ])

  useLayoutEffect(() => {
    if (!editing || isSticky) {
      editor.actions.edit.nodeText.clearSize(node.id)
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

    editor.actions.edit.nodeText.set(node.id, {
      size
    })
  }, [draft, editing, editor, isSticky, node, placeholder, rect, sourceRef])

  useEffect(() => () => {
    editor.actions.edit.nodeText.clearSize(node.id)
  }, [editor, node.id])

  const commit = (
    nextDraft = draft
  ) => {
    editor.actions.edit.nodeText.clear(node.id)
    editor.actions.edit.clear()

    if (node.type === 'text' && isTextContentEmpty(nextDraft)) {
      editor.actions.selection.clear()
      editor.actions.node.remove([node.id])
      return
    }

    editor.actions.node.patch([node.id], toNodeDataPatch(node, {
      text: nextDraft
    }))
  }

  const cancel = () => {
    setDraft(text)
    editor.actions.edit.nodeText.clear(node.id)
    editor.actions.edit.clear()
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

  return (
    <>
      <div className="wb-text-node-viewport" ref={setAnchorRef} />
      {editorRect && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="wb-text-edit-portal"
              style={{
                left: editorRect.left,
                top: editorRect.top,
                width: rect.width,
                height: rect.height,
                transform: `scale(${viewport.zoom})`,
                transformOrigin: '0 0'
              }}
            >
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
                  commit(readEditableText(event.currentTarget))
                }}
                style={{
                  fontSize,
                  color
                } as CSSProperties}
              />
            </div>,
            document.body
          )
        : null}
    </>
  )
}

const TextNodeRenderer = (
  props: TextNodeRendererProps
) => {
  const edit = useEdit()
  const editing = edit?.kind === 'node' && edit.nodeId === props.node.id && edit.field === 'text'

  return editing
    ? <TextNodeEditor {...props} />
    : <TextNodeDisplay {...props} />
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
