import { Settings2 } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  Menu,
  type MenuHandle,
  type MenuItem
} from '@shared/ui/menu'
import { useDataView } from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import {
  OptionToken
} from '@dataview/react/field/options'
import type { EditorSubmitTrigger } from '@dataview/react/interaction'
import { useTranslation } from '@shared/i18n/react'
import {
  buildEditableOptionItem,
  readOptionLabel
} from '@dataview/react/menu-builders'
import type { FieldValueDraftEditorProps } from '@dataview/react/field/value/editor/contracts'
import { focusInputWithoutScroll } from '@shared/dom'
import { PickerInputBar } from '@dataview/react/field/value/editor/shared/PickerInputBar'
import { useDraftCommit } from '@dataview/react/field/value/editor/shared/useDraftCommit'
import { usePickerKeydown } from '@dataview/react/field/value/editor/shared/usePickerKeydown'

const optionLabel = (
  option: ReturnType<typeof fieldApi.option.read.list>[number],
  t: ReturnType<typeof useTranslation>['t']
) => readOptionLabel(option, t)
type StatusPickerEntry = MenuItem

export const StatusValueEditor = (
  props: FieldValueDraftEditorProps<string>
) => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const page = dataView.session.page
  const valueEditor = dataView.session.valueEditor
  const inputRef = useRef<HTMLInputElement | null>(null)
  const menuRef = useRef<MenuHandle | null>(null)
  const [query, setQuery] = useState('')
  const [editingOptionId, setEditingOptionId] = useState<string>()
  const field = props.field
  const fieldId = field?.id ?? ''
  const normalizedQuery = fieldApi.option.token.normalize(query)
  const selectedOption = fieldApi.option.read.get(field, props.draft)
  const exactMatch = fieldApi.option.read.find(field, query)
  const sections = useMemo(() => {
    const allSections = fieldApi.status.sections(field)
    if (!normalizedQuery) {
      return allSections
    }

    return allSections
      .map(section => ({
        ...section,
        options: section.options.filter(option => (
          fieldApi.option.token.normalize(option.name).includes(normalizedQuery)
          || fieldApi.option.token.normalize(option.id).includes(normalizedQuery)
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
        label: fieldApi.status.category.label(section.category)
      },
      ...section.options.map(option => buildEditableOptionItem({
        fieldId,
        option,
        t,
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
    selectOption,
    t
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
            : t(meta.ui.field.status.searchPlaceholder)}
        >
          {selectedOption ? (
            <OptionToken
              label={optionLabel(selectedOption, t)}
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
            key: 'field',
            label: t(meta.ui.viewSettings.routeTitle('field')),
            leading: <Settings2 className="size-4" size={16} strokeWidth={1.8} />,
            onSelect: () => {
              valueEditor.close({
                silent: true
              })
              window.requestAnimationFrame(() => {
                page.settings.open({
                  kind: 'field',
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
