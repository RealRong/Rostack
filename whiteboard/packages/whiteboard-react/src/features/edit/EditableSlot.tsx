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

export type EditableSlotProps = {
  value: string
  caret: EditCaret
  multiline: boolean
  className?: string
  style?: CSSProperties
  bindRef?: RefCallback<HTMLDivElement | null>
}

const isPointCaret = (
  caret: EditCaret
): caret is Extract<EditCaret, { kind: 'point' }> => caret.kind === 'point'

export const EditableSlot = ({
  value,
  caret,
  multiline,
  className,
  style,
  bindRef
}: EditableSlotProps) => {
  const editor = useEditorRuntime()
  const elementRef = useRef<HTMLDivElement | null>(null)
  const composingRef = useRef(false)

  const setRef = useCallback((element: HTMLDivElement | null) => {
    elementRef.current = element
    bindRef?.(element)
  }, [bindRef])

  useEffect(() => {
    const element = elementRef.current
    if (!element || composingRef.current) {
      return
    }

    syncEditableDraft(element, value)
  }, [value])

  useEffect(() => {
    const element = elementRef.current
    if (!element) {
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
    caret.kind,
    isPointCaret(caret) ? caret.client.x : undefined,
    isPointCaret(caret) ? caret.client.y : undefined
  ])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) {
      return
    }

    if (isEscapeEditingKey(event)) {
      event.preventDefault()
      editor.actions.edit.cancel()
      return
    }

    if (!multiline && event.key === 'Enter') {
      event.preventDefault()
      editor.actions.edit.commit()
      return
    }

    if (isSubmitEditingKey(event)) {
      event.preventDefault()
      editor.actions.edit.commit()
    }
  }

  return (
    <div
      ref={setRef}
      data-selection-ignore
      data-input-ignore
      className={className}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline}
      spellCheck={false}
      onPointerDown={stopEditingPointerDown}
      onCompositionStart={(event) => {
        composingRef.current = true
        editor.actions.edit.layout({
          composing: true
        })
      }}
      onCompositionUpdate={(event) => {
        editor.actions.edit.input(readEditableText(event.currentTarget))
        editor.actions.edit.layout({
          composing: true
        })
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false
        editor.actions.edit.input(readEditableText(event.currentTarget))
        editor.actions.edit.layout({
          composing: false
        })
      }}
      onInput={(event) => {
        editor.actions.edit.input(readEditableText(event.currentTarget))
      }}
      onBlur={() => {
        editor.actions.edit.commit()
      }}
      onKeyDown={onKeyDown}
      style={style}
    />
  )
}
