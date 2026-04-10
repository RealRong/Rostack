import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import {
  isTextContentEmpty,
  resolveAnchoredRect
} from '@whiteboard/core/node'
import { useOptionalKeyedStoreValue, useStoreValue } from '@shared/react'
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

const EMPTY_NODE_STATE = {
  hovered: false,
  hidden: false,
  patched: false,
  resizing: false
}

const EMPTY_NODE_OVERLAY = {
  hovered: false,
  hidden: false,
  text: undefined
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

const TextNodeRenderer = ({
  node,
  rect,
  selected,
  variant
}: NodeRenderProps & { variant: 'text' | 'sticky' }) => {
  const editor = useEditor()
  const edit = useEdit()
  const editing = edit?.kind === 'node' && edit.nodeId === node.id && edit.field === 'text'
  const editCaret = editing ? edit.caret : undefined
  const text = typeof node.data?.text === 'string' ? node.data.text : ''
  const [draft, setDraft] = useState(text)
  const isSticky = variant === 'sticky'
  const sourceRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [sourceElement, setSourceElement] = useState<HTMLDivElement | null>(null)
  const viewport = useStoreValue(editor.state.viewport)
  const [editorRect, setEditorRect] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const nodeState = useOptionalKeyedStoreValue(
    editor.read.node.state,
    node.id,
    EMPTY_NODE_STATE
  )
  const nodeOverlay = useOptionalKeyedStoreValue(
    editor.read.overlay.node,
    node.id,
    EMPTY_NODE_OVERLAY
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
    setSourceElement((current) => current === element ? current : element)
  }
  const setAnchorRef = (element: HTMLDivElement | null) => {
    anchorRef.current = element
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

    const element = sourceElement
    if (!element) {
      return
    }

    syncEditableDraft(element, draft)
  }, [draft, editing, sourceElement])

  useEffect(() => {
    if (!editing) {
      return
    }

    const element = sourceElement
    if (!element) {
      return
    }

    return focusEditableDraft(element, editCaret)
  }, [editCaret, editing, sourceElement])

  useLayoutEffect(() => {
    if (!editing) {
      if (editorRect !== null) {
        setEditorRect(null)
      }
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
    editorRect,
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
      editor.view.preview.nodeText.clearSize(node.id)
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

    editor.view.preview.nodeText.set(node.id, {
      size
    })
  }, [draft, editing, editor, isSticky, node.id])

  useEffect(() => () => {
    editor.view.preview.nodeText.clearSize(node.id)
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
      const handle = nodeOverlay.text?.handle
      const nextRect = handle
        ? resolveAnchoredRect({
            rect,
            handle,
            width: rect.width,
            height: size.height
          })
        : {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: size.height
          }

      if (
        Math.abs(nextRect.x - rect.x) < SIZE_EPSILON
        && Math.abs(nextRect.y - rect.y) < SIZE_EPSILON
        && isSameSize(nextRect, rect)
      ) {
        return
      }

      editor.view.preview.nodeText.set(node.id, {
        position: {
          x: nextRect.x,
          y: nextRect.y
        },
        size: {
          width: nextRect.width,
          height: nextRect.height
        },
        handle
      })
      return
    }

    editor.view.preview.nodeText.clearSize(node.id)

    if (isSameSize(size, rect)) {
      return
    }

    editor.document.nodes.patch([node.id], {
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
    nodeOverlay.text?.handle,
    nodeState.resizing,
    placeholder,
    rect,
    text
  ])

  const commit = (
    nextDraft = draft
  ) => {
    editor.view.preview.nodeText.clear(node.id)
    editor.session.edit.clear()

    if (node.type === 'text' && isTextContentEmpty(nextDraft)) {
      editor.session.selection.clear()
      editor.document.nodes.remove([node.id])
      return
    }

    editor.document.nodes.patch([node.id], toNodeDataPatch(node, {
      text: nextDraft
    }))
  }

  const cancel = () => {
    setDraft(text)
    editor.view.preview.nodeText.clear(node.id)
    editor.session.edit.clear()
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

  return (
    <div className="wb-text-node-viewport" ref={setAnchorRef}>
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
