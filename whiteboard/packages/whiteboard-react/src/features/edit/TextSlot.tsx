import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type RefCallback
} from 'react'
import { readEditableText } from '@whiteboard/react/features/node/text'
import {
  focusEditableDraft,
  isEscapeEditingKey,
  isSubmitEditingKey,
  stopEditingPointerDown,
  syncEditableDraft
} from '@whiteboard/react/features/node/dom/editableText'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import type { EditCaret } from '@whiteboard/editor'

export type TextSlotProps = {
  value: string
  displayValue?: string
  caret?: EditCaret
  editable: boolean
  multiline: boolean
  className?: string
  style?: CSSProperties
  bindRef?: RefCallback<HTMLDivElement | null>
  nodeId?: string
  field?: string
}

const isPointCaret = (
  caret: EditCaret
): caret is Extract<EditCaret, { kind: 'point' }> => caret.kind === 'point'

export const TextSlot = ({
  value,
  displayValue,
  caret,
  editable,
  multiline,
  className,
  style,
  bindRef,
  nodeId,
  field
}: TextSlotProps) => {
  const editor = useEditorRuntime()
  const elementRef = useRef<HTMLDivElement | null>(null)
  const composingRef = useRef(false)

  const setRef = useCallback((element: HTMLDivElement | null) => {
    elementRef.current = element
    bindRef?.(element)
  }, [bindRef])

  useEffect(() => {
    const element = elementRef.current
    if (!element || (editable && composingRef.current)) {
      return
    }

    syncEditableDraft(
      element,
      editable
        ? value
        : (displayValue ?? value)
    )
  }, [displayValue, editable, value])

  useEffect(() => {
    const element = elementRef.current
    if (!editable || !element || !caret) {
      return
    }

    if (
      document.activeElement === element
      && !isPointCaret(caret)
    ) {
      return
    }

    return focusEditableDraft(element, caret)
  }, [
    caret,
    editable,
    caret?.kind,
    caret && isPointCaret(caret) ? caret.client.x : undefined,
    caret && isPointCaret(caret) ? caret.client.y : undefined
  ])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!editable || event.nativeEvent.isComposing) {
      return
    }

    if (isEscapeEditingKey(event)) {
      event.preventDefault()
      editor.write.edit.cancel()
      return
    }

    if (!multiline && event.key === 'Enter') {
      event.preventDefault()
      editor.write.edit.commit()
      return
    }

    if (isSubmitEditingKey(event)) {
      event.preventDefault()
      editor.write.edit.commit()
    }
  }

  return (
    <div
      ref={setRef}
      data-edit-node-id={nodeId}
      data-edit-field={field}
      data-editable={editable ? 'true' : 'false'}
      data-selection-ignore={editable ? 'true' : undefined}
      data-input-ignore={editable ? 'true' : undefined}
      className={className}
      contentEditable={editable ? 'plaintext-only' : undefined}
      suppressContentEditableWarning
      role={editable ? 'textbox' : undefined}
      aria-multiline={editable ? multiline : undefined}
      spellCheck={false}
      onPointerDown={editable ? stopEditingPointerDown : undefined}
      onCompositionStart={editable
        ? () => {
            composingRef.current = true
            editor.write.edit.composing(true)
          }
        : undefined}
      onCompositionUpdate={editable
        ? (event) => {
            editor.write.edit.input(readEditableText(event.currentTarget))
            editor.write.edit.composing(true)
          }
        : undefined}
      onCompositionEnd={editable
        ? (event) => {
            composingRef.current = false
            editor.write.edit.input(readEditableText(event.currentTarget))
            editor.write.edit.composing(false)
          }
        : undefined}
      onInput={editable
        ? (event) => {
            editor.write.edit.input(readEditableText(event.currentTarget))
          }
        : undefined}
      onBlur={editable
        ? () => {
            editor.write.edit.commit()
          }
        : undefined}
      onKeyDown={onKeyDown}
      style={style}
    />
  )
}
