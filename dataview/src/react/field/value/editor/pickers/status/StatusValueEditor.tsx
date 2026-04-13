import { Settings2 } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  findFieldOption,
  getFieldOption,
  getFieldOptions,
  getStatusCategoryLabel,
  getStatusSections,
  normalizeOptionToken
} from '@dataview/core/field'
import {
  Menu,
  type MenuHandle,
  type MenuItem
} from '@shared/ui/menu'
import { useDataView } from '#react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import {
  OptionToken
} from '#react/field/options'
import type { EditorSubmitTrigger } from '#react/interaction'
import {
  buildEditableOptionItem,
  readOptionLabel
} from '#react/menu-builders'
import type { FieldValueDraftEditorProps } from '../../contracts'
import { focusInputWithoutScroll } from '@shared/dom'
import { PickerInputBar } from '../../shared/PickerInputBar'
import { useDraftCommit } from '../../shared/useDraftCommit'
import { usePickerKeydown } from '../../shared/usePickerKeydown'

const optionLabel = (
  option: ReturnType<typeof getFieldOptions>[number]
) => readOptionLabel(option)
type StatusPickerEntry = MenuItem

export const StatusValueEditor = (
  props: FieldValueDraftEditorProps<string>
) => {
  const dataView = useDataView()
  const page = dataView.page
  const valueEditor = dataView.valueEditor
  const inputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<MenuHandle | null>(null)
  const [query, setQuery] = useState('')
  const [editingOptionId, setEditingOptionId] = useState<string>()
  const field = props.field
  const fieldId = field?.id ?? ''
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
  const visibleSections = useMemo(
    () => sections.filter(section => section.options.length > 0),
    [sections]
  )

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

  const pickerItems = useMemo<StatusPickerEntry[]>(() => visibleSections.flatMap((section, index) => {
    const sectionEntries: StatusPickerEntry[] = [
      {
        kind: 'label',
        key: `${section.category}-label`,
        label: getStatusCategoryLabel(section.category)
      },
      ...section.options.map(option => buildEditableOptionItem({
        fieldId,
        option,
        variant: 'status',
        open: editingOptionId === option.id,
        editing: editingOptionId === option.id,
        onOpenChange: open => {
          setEditingOptionId(open ? option.id : undefined)
        },
        onDeleted: () => {
          if (props.draft === option.id) {
            props.onDraftChange('')
          }
        },
        onSelect: () => {
          selectOption(option.id, 'programmatic')
        }
      }))
    ]

    if (index === 0) {
      return sectionEntries
    }

    return [
      {
        kind: 'divider',
        key: `${section.category}-divider`
      },
      ...sectionEntries
    ]
  }), [
    editingOptionId,
    fieldId,
    props.draft,
    props.onDraftChange,
    visibleSections,
    selectOption
  ])

  if (!field) {
    return null
  }

  const onKeyDown = usePickerKeydown({
    editingBlocked: Boolean(editingOptionId),
    onMoveNext: () => {
      menuRef.current?.moveNext()
    },
    onMovePrev: () => {
      menuRef.current?.movePrev()
    },
    onMoveFirst: () => {
      menuRef.current?.moveFirst()
    },
    onMoveLast: () => {
      menuRef.current?.moveLast()
    },
    onCancel: props.onCancel,
    onCommit: trigger => {
      const activeKey = menuRef.current?.getActiveKey() ?? null

      if (activeKey) {
        selectOption(activeKey, trigger)
        return
      }

      if (exactMatch) {
        selectOption(exactMatch.id, trigger)
        return
      }

      if (sections.length === 1 && sections[0]?.options.length === 1) {
        selectOption(sections[0].options[0].id, trigger)
        return
      }

      props.onCommit(trigger)
    }
  })

  return (
    <div className="flex min-h-0 flex-col" onKeyDown={onKeyDown}>
      <div>
        <PickerInputBar
          inputRef={inputRef}
          value={query}
          onValueChange={value => {
            setQuery(value)
            menuRef.current?.clearActive()
          }}
          placeholder={selectedOption
            ? ''
            : renderMessage(meta.ui.field.status.searchPlaceholder)}
        >
          {selectedOption ? (
            <OptionToken
              label={optionLabel(selectedOption)}
              color={selectedOption.color ?? undefined}
              variant="status"
              onRemove={clearSelection}
            />
          ) : null}
        </PickerInputBar>
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-divider">
        <div className="max-h-72 overflow-y-auto py-2">
          <Menu
            ref={menuRef}
            items={pickerItems}
            className="gap-0.5 px-1.5"
            autoFocus={false}
          />
        </div>
      </div>

      <div className="border-t border-divider p-1.5">
        <Menu
          autoFocus={false}
          items={[{
            kind: 'action',
            key: 'fieldSchema',
            label: renderMessage(meta.ui.viewSettings.routeTitle('fieldSchema')),
            leading: <Settings2 className="size-4" size={16} strokeWidth={1.8} />,
            onSelect: () => {
              valueEditor.close({
                silent: true
              })
              window.requestAnimationFrame(() => {
                page.settings.open({
                  kind: 'fieldSchema',
                  fieldId
                })
              })
            }
          }]}
        />
      </div>
    </div>
  )
}
