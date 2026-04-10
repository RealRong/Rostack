import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useStoreValue } from '@shared/react'
import { measureBoundTextNodeSize, readEditableText } from '#react/features/node/text'
import {
  focusEditableDraft,
  isEscapeEditingKey,
  isSubmitEditingKey,
  stopEditingPointerDown,
  syncEditableDraft
} from '#react/features/node/dom/editableText'
import { useEditorRuntime } from '#react/runtime/hooks'

type AnchorLayout = {
  rect: {
    left: number
    top: number
    width: number
    height: number
  }
  style: CSSProperties
}

const LAYOUT_EPSILON = 0.5

const isLayoutEqual = (
  left: AnchorLayout | null,
  right: AnchorLayout | null
) => {
  if (!left || !right) {
    return left === right
  }

  return (
    Math.abs(left.rect.left - right.rect.left) < LAYOUT_EPSILON
    && Math.abs(left.rect.top - right.rect.top) < LAYOUT_EPSILON
    && Math.abs(left.rect.width - right.rect.width) < LAYOUT_EPSILON
    && Math.abs(left.rect.height - right.rect.height) < LAYOUT_EPSILON
    && left.style.fontFamily === right.style.fontFamily
    && left.style.fontSize === right.style.fontSize
    && left.style.fontWeight === right.style.fontWeight
    && left.style.fontStyle === right.style.fontStyle
    && left.style.lineHeight === right.style.lineHeight
    && left.style.letterSpacing === right.style.letterSpacing
    && left.style.textAlign === right.style.textAlign
    && left.style.whiteSpace === right.style.whiteSpace
    && left.style.wordBreak === right.style.wordBreak
    && left.style.overflowWrap === right.style.overflowWrap
    && left.style.padding === right.style.padding
    && left.style.color === right.style.color
    && left.style.display === right.style.display
    && left.style.alignItems === right.style.alignItems
    && left.style.justifyContent === right.style.justifyContent
  )
}

const resolveAnchor = (
  key: string
) => {
  if (typeof document === 'undefined') {
    return null
  }

  if (key.startsWith('node:')) {
    const [, nodeId, field] = key.split(':')
    return document.querySelector<HTMLElement>(
      `[data-edit-node-id="${nodeId}"][data-edit-field="${field}"]`
    )
  }

  const [, edgeId, labelId] = key.split(':')
  return document.querySelector<HTMLElement>(
    `[data-edit-edge-id="${edgeId}"][data-edit-label-id="${labelId}"]`
  )
}

const readAnchorLayout = (
  anchor: HTMLElement
): AnchorLayout => {
  const rect = anchor.getBoundingClientRect()
  const computed = window.getComputedStyle(anchor)

  return {
    rect: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    },
    style: {
      boxSizing: computed.boxSizing as CSSProperties['boxSizing'],
      display: computed.display,
      alignItems: computed.alignItems,
      justifyContent: computed.justifyContent,
      padding: computed.padding,
      borderRadius: computed.borderRadius,
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      fontStyle: computed.fontStyle,
      lineHeight: computed.lineHeight,
      letterSpacing: computed.letterSpacing,
      textTransform: computed.textTransform,
      textAlign: computed.textAlign as CSSProperties['textAlign'],
      whiteSpace: computed.whiteSpace as CSSProperties['whiteSpace'],
      wordBreak: computed.wordBreak as CSSProperties['wordBreak'],
      overflowWrap: computed.overflowWrap as CSSProperties['overflowWrap'],
      color: computed.color
    }
  }
}

export const EditingHost = () => {
  const editor = useEditorRuntime()
  const presentation = useStoreValue(editor.select.editHost())
  const editableRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState<AnchorLayout | null>(null)

  useLayoutEffect(() => {
    if (!presentation) {
      setLayout(null)
      return
    }

    const anchor = resolveAnchor(presentation.key)
    if (!anchor) {
      setLayout(null)
      return
    }

    const update = () => {
      const next = readAnchorLayout(anchor)
      setLayout((current) => isLayoutEqual(current, next) ? current : next)
    }

    update()

    const observer = new ResizeObserver(update)
    observer.observe(anchor)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [presentation?.key, presentation?.text])

  useEffect(() => {
    if (!presentation) {
      return
    }

    const element = editableRef.current
    if (!element) {
      return
    }

    syncEditableDraft(element, presentation.text)
  }, [presentation])

  useEffect(() => {
    if (!presentation) {
      return
    }

    const element = editableRef.current
    if (!element) {
      return
    }

    return focusEditableDraft(element, presentation.session.caret)
  }, [presentation?.key, presentation?.session.caret, presentation?.text])

  useEffect(() => {
    if (!presentation || presentation.measure !== 'text' || presentation.session.kind !== 'node') {
      return
    }

    const size = measureBoundTextNodeSize({
      editor,
      nodeId: presentation.session.nodeId,
      value: presentation.text,
      fontSize: presentation.session.draft.style?.size
    })

    editor.actions.edit.measure(size)
  }, [
    editor,
    presentation
  ])

  if (
    !presentation
    || !layout
    || typeof document === 'undefined'
  ) {
    return null
  }

  return createPortal(
    <div
      className="wb-edit-host-portal"
      style={{
        left: layout.rect.left,
        top: layout.rect.top,
        width: layout.rect.width,
        height: layout.rect.height
      }}
    >
      <div
        ref={editableRef}
        data-selection-ignore
        data-input-ignore
        className="wb-edit-host-input"
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={presentation.multiline}
        spellCheck={false}
        onPointerDown={stopEditingPointerDown}
        onInput={(event) => {
          editor.actions.edit.input(readEditableText(event.currentTarget))
        }}
        onBlur={() => {
          editor.actions.edit.commit()
        }}
        onKeyDown={(event) => {
          if (isEscapeEditingKey(event)) {
            event.preventDefault()
            editor.actions.edit.cancel()
            return
          }

          if (!presentation.multiline && event.key === 'Enter') {
            event.preventDefault()
            editor.actions.edit.commit()
            return
          }

          if (isSubmitEditingKey(event)) {
            event.preventDefault()
            editor.actions.edit.commit()
          }
        }}
        style={{
          ...layout.style,
          width: '100%',
          height: '100%',
          minWidth: '100%',
          minHeight: '100%',
          border: 'none',
          outline: 'none',
          background: 'transparent',
          boxShadow: 'none',
          color: 'transparent',
          caretColor: layout.style.color,
          userSelect: 'text',
          WebkitUserSelect: 'text'
        }}
      />
    </div>,
    document.body
  )
}
