import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type RefCallback
} from 'react'
import type { TextWidthMode } from '@whiteboard/core/node'
import type { Node } from '@whiteboard/core/types'
import { readEditableText } from '@whiteboard/react/features/node/text'
import { measureTextNodeSize } from '@whiteboard/react/features/node/dom/textMeasure'
import {
  focusEditableDraft,
  isEscapeEditingKey,
  isSubmitEditingKey,
  stopEditingPointerDown,
  syncEditableDraft
} from '@whiteboard/react/features/node/dom/editableText'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import type { EditCaret } from '@whiteboard/editor'

type TextMeasureInput = {
  node: Pick<Node, 'type' | 'data'>
  baseWidth: number
  placeholder: string
  minWidth?: number
  maxWidth?: number
  fontSize?: number
  widthMode?: TextWidthMode
  wrapWidth?: number
}

export type EditableSlotProps = {
  value: string
  caret: EditCaret
  multiline: boolean
  className?: string
  style?: CSSProperties
  bindRef?: RefCallback<HTMLDivElement | null>
  measure?: TextMeasureInput
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
  bindRef,
  measure
}: EditableSlotProps) => {
  const editor = useEditorRuntime()
  const elementRef = useRef<HTMLDivElement | null>(null)
  const composingRef = useRef(false)

  const setRef = useCallback((element: HTMLDivElement | null) => {
    elementRef.current = element
    bindRef?.(element)
  }, [bindRef])

  const reportLayout = useCallback((
    element: HTMLDivElement,
    patch?: {
      composing?: boolean
    }
  ) => {
    const nextPatch: {
      measuredSize?: {
        width: number
        height: number
      }
      wrapWidth?: number
      composing?: boolean
    } = {
      wrapWidth: measure?.widthMode === 'wrap'
        ? measure.wrapWidth
        : undefined,
      composing: patch?.composing
    }

    if (measure) {
      nextPatch.measuredSize = measureTextNodeSize({
        node: measure.node,
        rect: {
          width: measure.baseWidth
        },
        content: readEditableText(element),
        placeholder: measure.placeholder,
        source: element,
        minWidth: measure.minWidth,
        maxWidth: measure.maxWidth,
        fontSize: measure.fontSize,
        widthMode: measure.widthMode,
        wrapWidth: measure.wrapWidth
      })
    }

    editor.actions.edit.measure(nextPatch)
  }, [editor, measure])

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) {
      return
    }

    reportLayout(element, {
      composing: composingRef.current
    })
  }, [
    reportLayout,
    value
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
        reportLayout(event.currentTarget, {
          composing: true
        })
      }}
      onCompositionUpdate={(event) => {
        reportLayout(event.currentTarget, {
          composing: true
        })
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false
        editor.actions.edit.input(readEditableText(event.currentTarget))
        reportLayout(event.currentTarget, {
          composing: false
        })
      }}
      onInput={(event) => {
        editor.actions.edit.input(readEditableText(event.currentTarget))
        reportLayout(event.currentTarget, {
          composing: composingRef.current
        })
      }}
      onBlur={() => {
        editor.actions.edit.commit()
      }}
      onKeyDown={onKeyDown}
      style={style}
    />
  )
}
