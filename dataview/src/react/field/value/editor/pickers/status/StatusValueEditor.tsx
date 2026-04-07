import {
  MoreHorizontal,
  Settings2
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import {
  findFieldOption,
  getFieldOption,
  getFieldOptions,
  getStatusCategoryLabel,
  getStatusSections,
  normalizeOptionToken
} from '@dataview/core/field'
import { Button } from '@ui/button'
import { usePickerList } from '@ui/picker-list'
import { cn } from '@ui/utils'
import { useDataView } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import {
  buildStatusIdsAfterCategoryMove,
  buildStatusMoveMenuItems,
  FieldOptionTag,
  getStatusCategoryMeta,
  OptionEditorPopover,
  OptionToken
} from '@dataview/react/field/options'
import type { EditorSubmitTrigger } from '@dataview/react/interaction'
import type { FieldValueDraftEditorProps } from '../../contracts'
import { focusInputWithoutScroll } from '@dataview/dom/focus'
import {
  isComposing,
  keyAction
} from '../../shared/keyboard'
import { PickerInputBar } from '../../shared/PickerInputBar'
import { PickerOptionRow } from '../../shared/PickerOptionRow'
import { useDraftCommit } from '../../shared/useDraftCommit'

const optionLabel = (
  option: ReturnType<typeof getFieldOptions>[number]
) => option.name.trim() || renderMessage(meta.ui.field.options.untitled)

export const StatusValueEditor = (
  props: FieldValueDraftEditorProps<string>
) => {
  const dataView = useDataView()
  const editor = dataView.engine
  const page = dataView.page
  const valueEditor = dataView.valueEditor
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [editingOptionId, setEditingOptionId] = useState<string>()
  const field = props.field
  const normalizedQuery = normalizeOptionToken(query)
  const selectedOption = getFieldOption(field, props.draft)
  const exactMatch = findFieldOption(field, query)
  const sections = useMemo(() => {
    const allSections = getStatusSections(field)
    if (!normalizedQuery) {
      return allSections
    }

    return allSections
      .map(section => ({
        ...section,
        options: section.options.filter(option => (
          normalizeOptionToken(option.name).includes(normalizedQuery)
          || normalizeOptionToken(option.id).includes(normalizedQuery)
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
    setItemRef,
    moveNext,
    movePrev,
    moveFirst,
    moveLast,
    getItemId
  } = usePickerList({
    items: navigationItems,
    preferredKey: props.draft || null
  })

  useEffect(() => {
    if (!props.autoFocus) {
      return
    }

    focusInputWithoutScroll(inputRef.current)
  }, [props.autoFocus])

  useEffect(() => {
    if (
      editingOptionId
      && !sections.some(section => section.options.some(option => option.id === editingOptionId))
    ) {
      setEditingOptionId(undefined)
    }
  }, [editingOptionId, sections])

  if (!field) {
    return null
  }
  const { commitDraftDeferred } = useDraftCommit({
    onDraftChange: props.onDraftChange,
    onApply: props.onApply,
    onCommit: props.onCommit
  })

  const selectOption = (
    optionId: string,
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    setQuery('')
    commitDraftDeferred(optionId, trigger)
  }

  const clearSelection = () => {
    setQuery('')
    props.onDraftChange('')
    focusInputWithoutScroll(inputRef.current)
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (editingOptionId) {
      event.stopPropagation()
      return
    }

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
      return
    }

    event.stopPropagation()
  }

  return (
    <div className="flex min-h-0 flex-col" onKeyDown={onKeyDown}>
      <div>
        <PickerInputBar
          inputRef={inputRef}
          value={query}
          onValueChange={value => {
            setQuery(value)
            setHighlightedKey(null)
          }}
          placeholder={selectedOption
            ? ''
            : renderMessage(meta.ui.field.status.searchPlaceholder)}
        >
          {selectedOption ? (
            <OptionToken
              label={optionLabel(selectedOption)}
              color={selectedOption.color ?? undefined}
              onRemove={clearSelection}
            />
          ) : null}
        </PickerInputBar>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-divider">
        <div className="px-3 py-2 text-[12px] font-medium text-muted-foreground">
          {renderMessage(meta.ui.field.status.searchPlaceholder)}
        </div>

        <div className="max-h-72 overflow-y-auto px-3 pb-2">
          <div className="flex flex-col">
            {sections.map((section, index) => (
              <div
                key={section.category}
                className={index === 0 ? 'pb-4' : 'border-t border-divider pb-4 pt-4'}
              >
                <div className="text-[12px] font-medium text-muted-foreground">
                  {getStatusCategoryLabel(section.category)}
                </div>
                <div className="flex flex-col gap-0.5 pt-2">
                  {section.options.map(option => (
                    <PickerOptionRow
                      key={option.id}
                      id={getItemId(option.id)}
                      rowRef={node => {
                        setItemRef(option.id, node)
                      }}
                      highlighted={highlightedKey === option.id}
                      open={editingOptionId === option.id}
                      onHighlight={() => {
                        setHighlightedKey(option.id)
                      }}
                      onSelect={() => {
                        selectOption(option.id, 'programmatic')
                      }}
                      leading={(() => {
                        const visual = getStatusCategoryMeta(section.category)
                        const Icon = visual.Icon

                        return (
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                            <Icon
                              className={cn('size-4 shrink-0', visual.className)}
                              size={16}
                              strokeWidth={1.8}
                            />
                          </span>
                        )
                      })()}
                      trailing={(
                        <OptionEditorPopover
                          option={{
                            ...option,
                            color: option.color ?? undefined
                          }}
                          open={editingOptionId === option.id}
                          onOpenChange={open => {
                            setEditingOptionId(open ? option.id : undefined)
                            if (open) {
                              setHighlightedKey(option.id)
                            }
                          }}
                          onRename={name => editor.fields.options.update(field.id, option.id, { name }) !== undefined}
                          onColorChange={color => {
                            editor.fields.options.update(field.id, option.id, { color })
                          }}
                          onDelete={() => {
                            editor.fields.options.remove(field.id, option.id)
                            if (props.draft === option.id) {
                              props.onDraftChange('')
                            }
                          }}
                          extraItems={buildStatusMoveMenuItems({
                            currentCategory: section.category,
                            onMoveCategory: category => {
                              if (category === section.category) {
                                setEditingOptionId(undefined)
                                return
                              }

                              editor.fields.options.reorder(
                                field.id,
                                buildStatusIdsAfterCategoryMove(
                                  sections,
                                  option.id,
                                  section.category,
                                  category
                                )
                              )
                              editor.fields.options.update(field.id, option.id, { category })
                              setEditingOptionId(undefined)
                            }
                          })}
                          trigger={(
                            <Button
                              variant="plain"
                              size="iconBare"
                              aria-label={renderMessage(meta.ui.field.options.edit(optionLabel(option)))}
                              onClick={event => {
                                event.stopPropagation()
                              }}
                            >
                              <MoreHorizontal className="size-4" size={16} strokeWidth={1.8} />
                            </Button>
                          )}
                        />
                      )}
                    >
                      <FieldOptionTag
                        label={optionLabel(option)}
                        color={option.color ?? undefined}
                        className="max-w-full"
                      />
                    </PickerOptionRow>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
