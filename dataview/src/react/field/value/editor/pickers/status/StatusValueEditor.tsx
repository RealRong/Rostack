import { Settings2, X } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { getFieldOptions, getStatusSections } from '@dataview/core/field'
import { Button } from '@ui/button'
import { Input } from '@ui/input'
import { usePickerList } from '@ui/picker-list'
import { useDataView } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import { FieldOptionTag } from '@dataview/react/field/options'
import type { EditorSubmitTrigger } from '@dataview/react/interaction'
import type { FieldValueDraftEditorProps } from '../../contracts'
import { focusInputWithoutScroll } from '@dataview/dom/focus'
import {
  isComposing,
  keyAction
} from '../../shared/keyboard'
import { useDraftCommit } from '../../shared/useDraftCommit'

const normalizeToken = (value: string) => value.trim().toLowerCase()

const categoryLabel = (category: 'todo' | 'in_progress' | 'complete') => {
  switch (category) {
    case 'todo':
      return renderMessage(meta.ui.field.status.todo)
    case 'in_progress':
      return renderMessage(meta.ui.field.status.inProgress)
    case 'complete':
    default:
      return renderMessage(meta.ui.field.status.complete)
  }
}

export const StatusValueEditor = (
  props: FieldValueDraftEditorProps<string>
) => {
  const dataView = useDataView()
  const page = dataView.page
  const valueEditor = dataView.valueEditor
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const field = props.field
  const options = getFieldOptions(field)
  const normalizedQuery = normalizeToken(query)
  const selectedOption = useMemo(
    () => options.find(option => option.id === props.draft),
    [options, props.draft]
  )
  const exactMatch = useMemo(() => {
    if (!normalizedQuery) {
      return undefined
    }

    return options.find(option => (
      normalizeToken(option.name) === normalizedQuery
      || normalizeToken(option.id) === normalizedQuery
    ))
  }, [normalizedQuery, options])
  const sections = useMemo(() => {
    const allSections = getStatusSections(field)
    if (!normalizedQuery) {
      return allSections
    }

    return allSections
      .map(section => ({
        ...section,
        options: section.options.filter(option => (
          normalizeToken(option.name).includes(normalizedQuery)
          || normalizeToken(option.id).includes(normalizedQuery)
        ))
      }))
      .filter(section => section.options.length > 0)
  }, [field, normalizedQuery])
  const navigationItems = useMemo(
    () => sections.flatMap(section => section.options.map(option => ({
      key: option.id
    }))),
    [sections]
  )
  const {
    highlightedKey,
    setHighlightedKey,
    moveNext,
    movePrev,
    moveFirst,
    moveLast
  } = usePickerList({
    items: navigationItems,
    preferredKey: props.draft || null
  })

  useEffect(() => {
    if (!props.autoFocus) {
      return
    }

    focusInputWithoutScroll(inputRef.current, {
      select: true
    })
  }, [props.autoFocus])

  if (!field) {
    return null
  }
  const { commitDraft, commitDraftDeferred } = useDraftCommit({
    onDraftChange: props.onDraftChange,
    onApply: props.onApply,
    onCommit: props.onCommit
  })

  const selectOption = (
    optionId: string,
    trigger: EditorSubmitTrigger = 'programmatic',
    deferred = false
  ) => {
    setQuery('')
    if (deferred) {
      commitDraftDeferred(optionId, trigger)
      return
    }

    commitDraft(optionId, trigger)
  }

  const clearSelection = () => {
    setQuery('')
    commitDraft('')
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const composing = isComposing(event.nativeEvent)
    const action = keyAction({
      key: event.key,
      shiftKey: event.shiftKey,
      composing
    })

    if (!composing && event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      moveNext()
      return
    }

    if (!composing && event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      movePrev()
      return
    }

    if (!composing && event.key === 'Home') {
      event.preventDefault()
      event.stopPropagation()
      moveFirst()
      return
    }

    if (!composing && event.key === 'End') {
      event.preventDefault()
      event.stopPropagation()
      moveLast()
      return
    }

    if (action.type === 'cancel') {
      event.preventDefault()
      props.onCancel()
      return
    }

    if (action.type === 'commit') {
      event.preventDefault()

      if (highlightedKey) {
        selectOption(highlightedKey, action.trigger)
        return
      }

      if (exactMatch) {
        selectOption(exactMatch.id, action.trigger)
        return
      }

      if (sections.length === 1 && sections[0]?.options.length === 1) {
        selectOption(sections[0].options[0].id, action.trigger)
        return
      }

      props.onCommit(action.trigger)
    }
  }

  return (
    <div className="flex min-h-0 flex-col" onKeyDown={onKeyDown}>
      <div className="border-b border-divider px-3 py-3">
        {selectedOption ? (
          <div className="mb-2 flex items-center gap-1">
            <div className="min-w-0">
              <FieldOptionTag
                label={selectedOption.name}
                color={selectedOption.color ?? undefined}
                size="md"
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={renderMessage(meta.ui.filter.clearSelection)}
              onMouseDown={event => event.preventDefault()}
              onClick={clearSelection}
            >
              <X className="size-4" size={14} strokeWidth={1.8} />
            </Button>
          </div>
        ) : null}

        <Input
          ref={inputRef}
          value={query}
          onChange={event => {
            setQuery(event.target.value)
            setHighlightedKey(null)
          }}
          placeholder={renderMessage(meta.ui.field.status.searchPlaceholder)}
        />
      </div>

      <div className="max-h-72 overflow-y-auto px-3 py-2">
        <div className="flex flex-col">
          {sections.map((section, index) => (
            <div
              key={section.category}
              className={index === 0 ? 'pb-4' : 'border-t border-divider py-4'}
            >
              <div className="text-[12px] font-medium text-muted-foreground">
                {categoryLabel(section.category)}
              </div>
              <div className="flex flex-wrap gap-2 pt-3">
                {section.options.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    className={highlightedKey === option.id
                      ? 'rounded-full bg-hover outline-none ring-2 ring-primary/30'
                      : 'rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/30'}
                    onPointerDown={event => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onMouseDown={event => event.preventDefault()}
                    onMouseEnter={() => {
                      setHighlightedKey(option.id)
                    }}
                    onClick={event => {
                      event.preventDefault()
                      event.stopPropagation()
                      selectOption(option.id, 'programmatic', true)
                    }}
                  >
                    <FieldOptionTag
                      label={option.name}
                      color={option.color ?? undefined}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-divider px-2 py-2">
        <Button
          layout="row"
          leading={<Settings2 className="size-4" size={16} strokeWidth={1.8} />}
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            valueEditor.close({
              silent: true
            })
            window.requestAnimationFrame(() => {
              page.settings.open({
                kind: 'fieldSchema',
                fieldId: field.id
              })
            })
          }}
        >
          {renderMessage(meta.ui.viewSettings.routeTitle('fieldSchema'))}
        </Button>
      </div>
    </div>
  )
}
