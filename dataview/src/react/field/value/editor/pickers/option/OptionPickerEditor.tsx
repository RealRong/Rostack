import {
  GripVertical,
  MoreHorizontal
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { getFieldOptions } from '@dataview/core/field'
import { meta, renderMessage } from '@dataview/meta'
import {
  OptionEditorPopover,
  OptionToken,
  FieldOptionTag
} from '@dataview/react/field/options'
import { Button } from '@ui/button'
import {
  PickerList,
  usePickerList
} from '@ui/picker-list'
import {
  VerticalReorderList,
  type VerticalReorderItemState
} from '@ui/vertical-reorder-list'
import { cn } from '@ui/utils'
import { useDataView } from '@dataview/react/dataview'
import type { EditorSubmitTrigger } from '@dataview/react/interaction'
import type { FieldValueDraftEditorProps } from '../../contracts'
import { focusInputWithoutScroll } from '@dataview/dom/focus'
import {
  isComposing,
  keyAction
} from '../../shared/keyboard'
import { useDraftCommit } from '../../shared/useDraftCommit'

const splitSelectedIds = (draft: string) => draft
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)

const joinSelectedIds = (values: readonly string[]) => values.join(', ')

const normalizeQuery = (value: string) => value.trim().toLowerCase()

const moveItem = <Item,>(items: readonly Item[], from: number, to: number) => {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  if (moved === undefined) {
    return next
  }

  next.splice(to, 0, moved)
  return next
}

const appendSelectedId = (
  selectedIds: readonly string[],
  optionId: string
) => selectedIds.includes(optionId)
    ? selectedIds
    : [...selectedIds, optionId]

const removeSelectedId = (
  selectedIds: readonly string[],
  optionId: string
) => selectedIds.filter(id => id !== optionId)

const optionLabel = (
  option: ReturnType<typeof getFieldOptions>[number]
) => option.name.trim() || renderMessage(meta.ui.field.options.untitled)

const filterOptionsByQuery = (
  options: ReturnType<typeof getFieldOptions>,
  query: string
) => {
  const normalized = normalizeQuery(query)
  if (!normalized) {
    return options
  }

  return options.filter(option => (
    normalizeQuery(option.name).includes(normalized)
  ))
}

export type PickerMode = 'single' | 'multi'

export interface OptionPickerEditorProps extends FieldValueDraftEditorProps<string> {
  mode: PickerMode
}

const CREATE_OPTION_KEY = '__create-option__'

const preventMouseDefault = (event: {
  preventDefault: () => void
  stopPropagation: () => void
}) => {
  event.preventDefault()
  event.stopPropagation()
}

const stopEventPropagation = (event: {
  stopPropagation: () => void
}) => {
  event.stopPropagation()
}

const OptionRow = (props: {
  option: ReturnType<typeof getFieldOptions>[number]
  highlighted: boolean
  open: boolean
  id?: string
  drag?: VerticalReorderItemState
  rowRef?: (node: HTMLDivElement | null) => void
  onHighlight: () => void
  onSelect: () => void
  onOpenChange: (open: boolean) => void
  onRename: (name: string) => boolean | void
  onColorChange: (color: string) => void
  onDelete: () => void
}) => {
  const label = optionLabel(props.option)

  return (
    <div
      id={props.id}
      ref={props.rowRef}
      className={cn(
        'group/option flex cursor-pointer h-8 items-center gap-1 rounded-lg px-1.5 py-1 transition-colors',
        props.drag?.dragging && 'opacity-70',
        props.open || props.highlighted
          ? 'bg-[var(--ui-control-hover)]'
          : ''
      )}
      onMouseDown={event => {
        event.preventDefault()
      }}
      onMouseEnter={props.onHighlight}
      onClick={event => {
        event.preventDefault()
        event.stopPropagation()
        props.onSelect()
      }}
    >
      {props.drag ? (
        <Button
          variant="plain"
          size="iconBare"
          aria-label={renderMessage(meta.ui.field.options.reorder(label))}
          {...props.drag.handle.attributes}
          {...props.drag.handle.listeners}
          ref={props.drag.handle.setActivatorNodeRef}
          style={{ touchAction: 'none' }}
          onMouseDown={stopEventPropagation}
          onClick={stopEventPropagation}
        >
          <GripVertical className="size-4 cursor-grab text-muted-foreground" size={16} strokeWidth={1.8} />
        </Button>
      ) : (
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
          <GripVertical className="size-4" size={16} strokeWidth={1.8} />
        </span>
      )}

      <div className="min-w-0 flex-1 flex items-center">
        <FieldOptionTag
          label={label}
          color={props.option.color ?? undefined}
          className="max-w-full"
        />
      </div>
      <span className={cn(
        'shrink-0 opacity-0 flex items-center transition-opacity',
        (props.open || props.highlighted) && 'opacity-100'
      )}>
        <OptionEditorPopover
          option={{
            ...props.option,
            color: props.option.color ?? undefined
          }}
          open={props.open}
          onOpenChange={props.onOpenChange}
          onRename={props.onRename}
          onColorChange={props.onColorChange}
          onDelete={props.onDelete}
          trigger={(
            <Button
              variant="plain"
              size="iconBare"
              aria-label={renderMessage(meta.ui.field.options.edit(label))}
              onClick={event => {
                event.stopPropagation()
              }}
            >
              <MoreHorizontal className="size-4" size={16} strokeWidth={1.8} />
            </Button>
          )}
        />
      </span>
    </div>
  )
}

export const OptionPickerEditor = (
  props: OptionPickerEditorProps
) => {
  const editor = useDataView().engine
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [query, setQuery] = useState('')
  const [editingOptionId, setEditingOptionId] = useState<string>()
  const field = props.field
  const options = getFieldOptions(field)
  const filteredOptions = useMemo(
    () => filterOptionsByQuery(options, query),
    [options, query]
  )
  const normalized = normalizeQuery(query)
  const exactMatch = useMemo(() => {
    if (!normalized) {
      return undefined
    }

    return options.find(option => normalizeQuery(option.name) === normalized)
  }, [normalized, options])
  const selectedIds = props.mode === 'multi'
    ? splitSelectedIds(props.draft)
    : props.draft
      ? [props.draft]
      : []
  const selectedIdSet = useMemo(
    () => new Set(selectedIds),
    [selectedIds]
  )
  const selectedOptions = useMemo(
    () => selectedIds
      .map(optionId => options.find(option => option.id === optionId))
      .filter((option): option is NonNullable<typeof option> => Boolean(option)),
    [options, selectedIds]
  )
  const canCreate = Boolean(normalized && !exactMatch)
  const navigationItems = useMemo(() => [
    ...filteredOptions.map(option => ({
      key: option.id,
      kind: 'option' as const
    })),
    ...(canCreate
      ? [{
        key: CREATE_OPTION_KEY,
        kind: 'create' as const
      }]
      : [])
  ], [canCreate, filteredOptions])
  const preferredHighlightedKey = !normalized
    && props.mode === 'single'
    && props.draft
    && navigationItems.some(item => item.key === props.draft)
    ? props.draft
    : null
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
    preferredKey: preferredHighlightedKey
  })

  useEffect(() => {
    if (!props.autoFocus) {
      return
    }

    focusInputWithoutScroll(inputRef.current)
  }, [props.autoFocus])

  useEffect(() => {
    if (editingOptionId && !options.some(option => option.id === editingOptionId)) {
      setEditingOptionId(undefined)
    }
  }, [editingOptionId, options])

  if (!field) {
    return null
  }
  const { applyDraft, commitDraft, commitDraftDeferred } = useDraftCommit({
    onDraftChange: props.onDraftChange,
    onApply: props.onApply,
    onCommit: props.onCommit
  })

  const updateMultiSelection = (
    nextSelectedIds: readonly string[],
    mode: 'apply' | 'commit',
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    const nextDraft = joinSelectedIds(nextSelectedIds)
    setQuery('')

    if (mode === 'apply') {
      applyDraft(nextDraft)
      return
    }

    commitDraft(nextDraft, trigger)
  }

  const selectOption = (
    optionId: string,
    mode: 'apply' | 'commit' = props.mode === 'single'
      ? 'commit'
      : 'apply',
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    if (props.mode === 'single') {
      setQuery('')
      if (mode === 'commit') {
        commitDraftDeferred(optionId, trigger)
        return
      }

      props.onDraftChange(optionId)
      return
    }

    if (selectedIdSet.has(optionId)) {
      setQuery('')
      return
    }

    const nextSelectedIds = appendSelectedId(selectedIds, optionId)
    updateMultiSelection(nextSelectedIds, mode, trigger)
  }

  const createOption = (
    mode: 'apply' | 'commit' = props.mode === 'single'
      ? 'commit'
      : 'apply',
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    const created = editor.fields.options.create(field.id, query)
    if (!created) {
      return false
    }

    if (props.mode === 'single') {
      setQuery('')
      if (mode === 'commit') {
        commitDraftDeferred(created.id, trigger)
        return true
      }

      props.onDraftChange(created.id)
      return true
    }

    const nextSelectedIds = selectedIdSet.has(created.id)
      ? selectedIds
      : [...selectedIds, created.id]
    updateMultiSelection(nextSelectedIds, mode, trigger)
    return true
  }

  const removeOptionFromDraft = (optionId: string) => {
    if (props.mode === 'single') {
      if (props.draft === optionId) {
        props.onDraftChange('')
      }
      return
    }

    if (!selectedIdSet.has(optionId)) {
      return
    }

    props.onDraftChange(joinSelectedIds(removeSelectedId(selectedIds, optionId)))
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

    if (!composing && action.type === 'commit') {
      event.preventDefault()

      if (props.mode === 'multi' && action.trigger === 'enter') {
        if (highlightedKey === CREATE_OPTION_KEY) {
          if (canCreate && createOption('apply')) {
            return
          }
        }

        if (highlightedKey) {
          selectOption(highlightedKey, 'apply')
          return
        }

        if (exactMatch) {
          selectOption(exactMatch.id, 'apply')
          return
        }

        if (filteredOptions.length === 1) {
          selectOption(filteredOptions[0].id, 'apply')
          return
        }

        if (canCreate && createOption('apply')) {
          return
        }

        return
      }

      if (
        props.mode === 'multi'
        && (action.trigger === 'tab-next' || action.trigger === 'tab-previous')
      ) {
        props.onCommit(action.trigger)
        return
      }

      if (highlightedKey === CREATE_OPTION_KEY) {
        if (canCreate && createOption('commit', action.trigger)) {
          return
        }
      }

      if (highlightedKey) {
        selectOption(highlightedKey, 'commit', action.trigger)
        return
      }

      if (exactMatch) {
        selectOption(exactMatch.id, 'commit', action.trigger)
        return
      }

      if (filteredOptions.length === 1) {
        selectOption(filteredOptions[0].id, 'commit', action.trigger)
        return
      }

      if (canCreate && createOption('commit', action.trigger)) {
        return
      }

      props.onCommit(action.trigger)
      return
    }

    event.stopPropagation()
  }

  const reorderOptions = (from: number, to: number) => {
    editor.fields.options.reorder(
      field.id,
      moveItem(options, from, to).map(option => option.id)
    )
  }

  const renderRow = (
    option: ReturnType<typeof getFieldOptions>[number],
    drag?: VerticalReorderItemState
  ) => (
    <OptionRow
      key={option.id}
      option={option}
      highlighted={highlightedKey === option.id}
      open={editingOptionId === option.id}
      id={getItemId(option.id)}
      drag={drag}
      rowRef={node => {
        setItemRef(option.id, node)
      }}
      onHighlight={() => {
        setHighlightedKey(option.id)
      }}
      onSelect={() => {
        selectOption(
          option.id,
          props.mode === 'single' ? 'commit' : 'apply',
          'programmatic'
        )
      }}
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
        removeOptionFromDraft(option.id)
      }}
    />
  )

  return (
    <div className="flex min-h-0 min-w-0 flex-col" onKeyDown={onKeyDown}>
      <div>
        <div
          className={
            'flex min-h-10 cursor-text flex-wrap items-center gap-1 p-2'
          }
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              event.preventDefault()
              focusInputWithoutScroll(inputRef.current)
            }
          }}
        >
          {selectedOptions.map(option => (
            <OptionToken
              key={option.id}
              label={optionLabel(option)}
              color={option.color ?? undefined}
              onRemove={() => {
                removeOptionFromDraft(option.id)
                focusInputWithoutScroll(inputRef.current)
              }}
            />
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={event => {
              setHighlightedKey(null)
              setQuery(event.target.value)
            }}
            placeholder={selectedOptions.length
              ? ''
              : renderMessage(meta.ui.field.options.selectOrCreate(props.mode === 'multi'))}
            className="min-w-[4ch] flex-1 border-0 bg-transparent px-1 py-1 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-divider">
        <div className="px-3 py-2 text-[12px] font-medium text-muted-foreground">
          {renderMessage(meta.ui.field.options.selectOrCreate(props.mode === 'multi'))}
        </div>

        <div className="max-h-72 overflow-y-auto px-2 pb-2">
          {normalized ? (
            <PickerList
              items={navigationItems}
              highlightedKey={highlightedKey}
              setHighlightedKey={setHighlightedKey}
              setItemRef={setItemRef}
              getItemId={getItemId}
              className="gap-0.5"
              renderItem={({ item, highlighted, id, ref }) => {
                if (item.key === CREATE_OPTION_KEY) {
                  return (
                    <div
                      key={item.key}
                      id={id}
                      ref={ref}
                      className={cn(
                        'rounded-lg transition-colors',
                        highlighted
                          ? 'bg-[var(--ui-control-hover)]'
                          : 'hover:bg-[var(--ui-control-hover)]'
                      )}
                      onMouseEnter={() => {
                        setHighlightedKey(CREATE_OPTION_KEY)
                      }}
                    >
                      <Button
                        variant="ghost"
                        layout="row"
                        onMouseDown={preventMouseDefault}
                        onClick={event => {
                          event.preventDefault()
                          event.stopPropagation()
                          createOption(
                            props.mode === 'single' ? 'commit' : 'apply',
                            'programmatic'
                          )
                        }}
                      >
                        <span className="truncate">
                          {renderMessage(meta.ui.field.options.create(query.trim()))}
                        </span>
                      </Button>
                    </div>
                  )
                }

                const option = filteredOptions.find(candidate => candidate.id === item.key)
                if (!option) {
                  return null
                }

                return (
                  <OptionRow
                    key={option.id}
                    option={option}
                    highlighted={highlighted}
                    open={editingOptionId === option.id}
                    id={id}
                    rowRef={ref}
                    onHighlight={() => {
                      setHighlightedKey(option.id)
                    }}
                    onSelect={() => {
                      selectOption(
                        option.id,
                        props.mode === 'single' ? 'commit' : 'apply',
                        'programmatic'
                      )
                    }}
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
                      removeOptionFromDraft(option.id)
                    }}
                  />
                )
              }}
            />
          ) : (
            <VerticalReorderList
              items={options}
              getItemId={option => option.id}
              className="gap-0.5"
              onMove={reorderOptions}
              renderItem={(option, drag) => renderRow(option, drag)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
