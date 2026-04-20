import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react'
import { flushSync } from 'react-dom'
import { field as fieldApi } from '@dataview/core/field'
import { meta } from '@dataview/meta'
import {
  type MenuItem,
  type MenuReorderItem
} from '@shared/ui/menu'
import { useDataView } from '@dataview/react/dataview'
import type { EditorSubmitTrigger } from '@dataview/react/interaction'
import { useTranslation } from '@shared/i18n/react'
import {
  buildEditableOptionItem,
  readOptionLabel
} from '@dataview/react/menu-builders'
import type { FieldValueDraftEditorProps } from '@dataview/react/field/value/editor/contracts'

const CREATE_OPTION_KEY = '__create-option__'
const splitDraftKeys = (draft: string) => draft
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)
const joinDraftKeys = (keys: readonly string[]) => keys.join(', ')

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

const filterOptionsByQuery = (
  options: ReturnType<typeof fieldApi.option.list>,
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

export interface OptionPickerControllerInput extends FieldValueDraftEditorProps<string> {
  mode: PickerMode
}

type OptionPickerEntry = MenuItem
type ReorderableOptionPickerItem = MenuReorderItem

export const useOptionPickerController = (
  input: OptionPickerControllerInput
) => {
  const { t } = useTranslation()
  const editor = useDataView().engine
  const [query, setQuery] = useState('')
  const [editingOptionId, setEditingOptionId] = useState<string>()
  const field = input.field
  const fieldId = field?.id ?? ''
  const options = fieldApi.option.list(field)
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
  const canCreate = Boolean(normalized && !exactMatch)
  useEffect(() => {
    if (
      editingOptionId
      && (
        !options.some(option => option.id === editingOptionId)
        || (normalized && !filteredOptions.some(option => option.id === editingOptionId))
      )
    ) {
      setEditingOptionId(undefined)
    }
  }, [editingOptionId, filteredOptions, normalized, options])

  const selectedKeys = useMemo(
    () => input.mode === 'multi'
      ? splitDraftKeys(input.draft)
      : input.draft
        ? [input.draft]
        : [],
    [input.draft, input.mode]
  )
  const selectedKeySet = useMemo(
    () => new Set(selectedKeys),
    [selectedKeys]
  )
  const selectedOptions = useMemo(
    () => selectedKeys
      .map(optionId => options.find(option => option.id === optionId))
      .filter((option): option is NonNullable<typeof option> => Boolean(option))
      .map(option => ({
        id: option.id,
        label: readOptionLabel(option, t),
        color: option.color ?? undefined
      })),
    [options, selectedKeys, t]
  )

  const applyDraft = useCallback((nextDraft: string) => {
    flushSync(() => {
      input.onDraftChange(nextDraft)
    })
    input.onApply()
  }, [input])

  const commitDraft = useCallback((
    nextDraft: string,
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    flushSync(() => {
      input.onDraftChange(nextDraft)
    })
    input.onCommit(trigger)
  }, [input])

  const commitDraftDeferred = useCallback((
    nextDraft: string,
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    flushSync(() => {
      input.onDraftChange(nextDraft)
    })

    if (typeof window === 'undefined') {
      input.onCommit(trigger)
      return
    }

    window.requestAnimationFrame(() => {
      input.onCommit(trigger)
    })
  }, [input])

  const selectOption = useCallback((
    optionId: string,
    mode: 'apply' | 'commit' = input.mode === 'single'
      ? 'commit'
      : 'apply',
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    setQuery('')

    if (input.mode === 'single') {
      if (mode === 'commit') {
        commitDraftDeferred(optionId, trigger)
        return
      }

      input.onDraftChange(optionId)
      return
    }

    if (selectedKeySet.has(optionId)) {
      return
    }

    const nextDraft = joinDraftKeys([...selectedKeys, optionId])
    if (mode === 'apply') {
      applyDraft(nextDraft)
      return
    }

    commitDraft(nextDraft, trigger)
  }, [
    applyDraft,
    commitDraft,
    commitDraftDeferred,
    input,
    selectedKeySet,
    selectedKeys
  ])

  const createOption = useCallback((
    mode: 'apply' | 'commit' = input.mode === 'single'
      ? 'commit'
      : 'apply',
    trigger: EditorSubmitTrigger = 'programmatic'
  ) => {
    if (!field) {
      return false
    }

    const created = editor.fields.options.create(fieldId, query)
    if (!created) {
      return false
    }

    setQuery('')
    if (input.mode === 'single') {
      if (mode === 'commit') {
        commitDraftDeferred(created.id, trigger)
        return true
      }

      input.onDraftChange(created.id)
      return true
    }

    const nextDraft = selectedKeySet.has(created.id)
      ? joinDraftKeys(selectedKeys)
      : joinDraftKeys([...selectedKeys, created.id])
    if (mode === 'apply') {
      applyDraft(nextDraft)
      return true
    }

    commitDraft(nextDraft, trigger)
    return true
  }, [
    applyDraft,
    commitDraft,
    commitDraftDeferred,
    editor.fields.options,
    field,
    fieldId,
    input,
    query,
    selectedKeySet,
    selectedKeys
  ])

  const buildOptionItem = useCallback((
    option: ReturnType<typeof fieldApi.option.list>[number]
  ) => buildEditableOptionItem({
    fieldId,
    option,
    t,
    open: editingOptionId === option.id,
    editing: editingOptionId === option.id,
    onOpenChange: open => {
      setEditingOptionId(open ? option.id : undefined)
    },
    onDeleted: () => {
      if (input.mode === 'single') {
        if (input.draft === option.id) {
          input.onDraftChange('')
        }
        return
      }

      if (!selectedKeySet.has(option.id)) {
        return
      }

      input.onDraftChange(joinDraftKeys(
        selectedKeys.filter(selectedKey => selectedKey !== option.id)
      ))
    },
    onSelect: () => {
      selectOption(
        option.id,
        input.mode === 'single' ? 'commit' : 'apply',
        'programmatic'
      )
    },
    closeOnSelect: input.mode !== 'single'
  }), [
    editingOptionId,
    fieldId,
    input.draft,
    input.mode,
    input.onDraftChange,
    selectOption,
    selectedKeySet,
    selectedKeys,
    t
  ])

  const pickerItems = useMemo<OptionPickerEntry[]>(() => [
    ...filteredOptions.map(option => buildOptionItem(option)),
    ...(canCreate
      ? [{
          kind: 'item' as const,
          key: CREATE_OPTION_KEY,
          label: (
            <span className="truncate">
              {t(meta.ui.field.options.create(query.trim()))}
            </span>
          ),
          onSelect: () => {
            createOption(
              input.mode === 'single' ? 'commit' : 'apply',
              'programmatic'
            )
          }
        }]
      : [])
  ], [
    buildOptionItem,
    canCreate,
    createOption,
    filteredOptions,
    input.mode,
    query,
    t
  ])
  const reorderableItems = useMemo<ReorderableOptionPickerItem[]>(() => options.map(option => ({
    ...buildOptionItem(option),
    handleAriaLabel: t(meta.ui.field.options.reorder(readOptionLabel(option, t)))
  })), [
    buildOptionItem,
    options,
    t
  ])

  const handleCommit = useCallback((
    activeKey: string | null,
    trigger: EditorSubmitTrigger
  ) => {
    if (input.mode === 'multi' && trigger === 'enter') {
      if (activeKey === CREATE_OPTION_KEY) {
        if (canCreate && createOption('apply')) {
          return
        }
      }

      if (activeKey) {
        selectOption(activeKey, 'apply')
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
      input.mode === 'multi'
      && (trigger === 'tab-next' || trigger === 'tab-previous')
    ) {
      input.onCommit(trigger)
      return
    }

    if (activeKey === CREATE_OPTION_KEY) {
      if (canCreate && createOption('commit', trigger)) {
        return
      }
    }

    if (activeKey) {
      selectOption(activeKey, 'commit', trigger)
      return
    }

    if (exactMatch) {
      selectOption(exactMatch.id, 'commit', trigger)
      return
    }

    if (filteredOptions.length === 1) {
      selectOption(filteredOptions[0].id, 'commit', trigger)
      return
    }

    if (canCreate && createOption('commit', trigger)) {
      return
    }

    input.onCommit(trigger)
  }, [
    canCreate,
    createOption,
    exactMatch,
    filteredOptions,
    input,
    selectOption
  ])

  const reorderOptions = useCallback((from: number, to: number) => {
    editor.fields.options.reorder(
      fieldId,
      moveItem(options, from, to).map(option => option.id)
    )
  }, [editor.fields.options, fieldId, options])

  const onQueryChange = useCallback((value: string) => {
    setQuery(value)
  }, [])

  const removeSelectedOption = useCallback((optionId: string) => {
    if (input.mode === 'single') {
      if (input.draft === optionId) {
        input.onDraftChange('')
      }
      return
    }

    if (!selectedKeySet.has(optionId)) {
      return
    }

    input.onDraftChange(joinDraftKeys(
      selectedKeys.filter(selectedKey => selectedKey !== optionId)
    ))
  }, [input, selectedKeySet, selectedKeys])

  return {
    query,
    normalized,
    selectedOptions,
    pickerItems,
    reorderableItems,
    editingOptionId,
    handleCommit,
    onQueryChange,
    reorderOptions,
    removeSelectedOption
  }
}
