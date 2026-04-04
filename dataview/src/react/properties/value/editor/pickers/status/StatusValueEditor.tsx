import { Settings2, X } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { getPropertyOptions, getStatusSections } from '@dataview/core/property'
import { Button } from '@ui/button'
import { Input } from '@ui/input'
import { useDataView } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import { PropertyOptionTag } from '@dataview/react/properties/options'
import type { ValueEditorIntent } from '@dataview/react/interaction'
import type { PropertyValueDraftEditorProps } from '../../contracts'
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
      return renderMessage(meta.ui.property.status.todo)
    case 'in_progress':
      return renderMessage(meta.ui.property.status.inProgress)
    case 'complete':
    default:
      return renderMessage(meta.ui.property.status.complete)
  }
}

export const StatusValueEditor = (
  props: PropertyValueDraftEditorProps<string>
) => {
  const dataView = useDataView()
  const page = dataView.page
  const valueEditor = dataView.valueEditor
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const property = props.property
  const options = getPropertyOptions(property)
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
      || normalizeToken(option.key) === normalizedQuery
      || normalizeToken(option.id) === normalizedQuery
    ))
  }, [normalizedQuery, options])
  const sections = useMemo(() => {
    const allSections = getStatusSections(property)
    if (!normalizedQuery) {
      return allSections
    }

    return allSections
      .map(section => ({
        ...section,
        options: section.options.filter(option => (
          normalizeToken(option.name).includes(normalizedQuery)
          || normalizeToken(option.key).includes(normalizedQuery)
          || normalizeToken(option.id).includes(normalizedQuery)
        ))
      }))
      .filter(section => section.options.length > 0)
  }, [property, normalizedQuery])

  useEffect(() => {
    if (!props.autoFocus) {
      return
    }

    focusInputWithoutScroll(inputRef.current, {
      select: true
    })
  }, [props.autoFocus])

  if (!property) {
    return null
  }
  const { commitDraft, commitDraftDeferred } = useDraftCommit({
    onDraftChange: props.onDraftChange,
    onCommit: props.onCommit
  })

  const selectOption = (
    optionId: string,
    intent: ValueEditorIntent = 'done',
    deferred = false
  ) => {
    setQuery('')
    if (deferred) {
      commitDraftDeferred(optionId, intent)
      return
    }

    commitDraft(optionId, intent)
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
      composing,
      enterIntent: props.enterIntent
    })

    if (action.type === 'cancel') {
      event.preventDefault()
      props.onCancel()
      return
    }

    if (action.type === 'submit') {
      event.preventDefault()

      if (exactMatch) {
        selectOption(exactMatch.id, action.intent)
        return
      }

      if (sections.length === 1 && sections[0]?.options.length === 1) {
        selectOption(sections[0].options[0].id, action.intent)
        return
      }

      props.onCommit(action.intent)
    }
  }

  return (
    <div className="flex min-h-0 flex-col" onKeyDown={onKeyDown}>
      <div className="border-b border-divider px-3 py-3">
        {selectedOption ? (
          <div className="mb-2 flex items-center gap-1">
            <div className="min-w-0">
              <PropertyOptionTag
                label={selectedOption.name}
                color={selectedOption.color}
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
          onChange={event => setQuery(event.target.value)}
          placeholder={renderMessage(meta.ui.property.status.searchPlaceholder)}
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
                    className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    onPointerDown={event => {
                      event.preventDefault()
                      event.stopPropagation()
                    }}
                    onMouseDown={event => event.preventDefault()}
                    onClick={event => {
                      event.preventDefault()
                      event.stopPropagation()
                      selectOption(option.id, 'done', true)
                    }}
                  >
                    <PropertyOptionTag
                      label={option.name}
                      color={option.color}
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
                kind: 'propertySchema',
                propertyId: property.id
              })
            })
          }}
        >
          {renderMessage(meta.ui.viewSettings.routeTitle('propertySchema'))}
        </Button>
      </div>
    </div>
  )
}
