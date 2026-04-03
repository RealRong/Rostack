import { useEffect, useRef } from 'react'
import { focusInputWithoutScroll } from '@dataview/dom/focus'
import { Input } from '@ui/input'
import { cn } from '@ui/utils'

export interface CardTitleProps {
  editing: boolean
  text: string
  draft?: string
  placeholder: string
  textClassName?: string
  inputClassName?: string
  onDraftChange?: (value: string) => void
  onCommit?: () => void
  onSubmit?: () => void
}

export const CardTitle = (props: CardTitleProps) => {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!props.editing) {
      return
    }

    focusInputWithoutScroll(inputRef.current, {
      select: true
    })
  }, [props.editing])

  if (props.editing) {
    return (
      <Input
        ref={inputRef}
        value={props.draft ?? ''}
        placeholder={props.placeholder}
        className={cn(
          'h-auto rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0',
          props.inputClassName
        )}
        onClick={event => {
          event.stopPropagation()
        }}
        onChange={event => {
          props.onDraftChange?.(event.target.value)
        }}
        onBlur={() => {
          props.onCommit?.()
        }}
        onKeyDown={event => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.preventDefault()
            props.onSubmit?.()
          }
        }}
      />
    )
  }

  return (
    <div
      className={cn(
        'min-w-0',
        props.text.trim()
          ? 'text-foreground'
          : 'text-muted-foreground',
        props.textClassName
      )}
    >
      <div className="truncate">
        {props.text.trim() || props.placeholder}
      </div>
    </div>
  )
}
