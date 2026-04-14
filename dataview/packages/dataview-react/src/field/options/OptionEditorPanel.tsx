import {
  Check,
  Flag,
  Settings2,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type {
  StatusCategory,
  StatusField
} from '@dataview/core/contracts'
import {
  getFieldOption,
  getStatusCategoryLabel,
  getStatusFieldDefaultOption,
  getStatusOptionCategory,
  getStatusSections
} from '@dataview/core/field'
import { Input } from '@shared/ui/input'
import { Menu, type MenuItem } from '@shared/ui/menu'
import {
  useDataView,
  useDataViewKeyedValue
} from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import {
  buildChoiceSubmenuItem,
  buildOptionColorItems
} from '@dataview/react/menu-builders'
import { FIELD_DROPDOWN_MENU_PROPS } from '@dataview/react/field/dropdown'
import type { OptionLike } from '@dataview/react/field/options/OptionEditorPopover'
import { buildStatusIdsAfterCategoryMove } from '@dataview/react/field/options/statusOptionMenu'

export interface OptionEditorPanelProps {
  fieldId: string
  option: OptionLike
  onDeleted?: () => void
  onRequestClose?: () => void
}

export const OptionEditorPanel = (props: OptionEditorPanelProps) => {
  const editor = useDataView().engine
  const field = useDataViewKeyedValue(
    dataView => dataView.engine.select.fields.byId,
    props.fieldId
  )
  const currentOption = getFieldOption(field, props.option.id)
  const optionName = currentOption?.name ?? props.option.name
  const optionColor = currentOption?.color ?? props.option.color ?? undefined
  const statusCategory = field?.kind === 'status'
    ? getStatusOptionCategory(field, props.option.id)
    : undefined
  const defaultStatusOptionId = field?.kind === 'status'
    ? getStatusFieldDefaultOption(field)?.id
    : undefined
  const isDefaultStatusOption = defaultStatusOptionId === props.option.id
  const [draftName, setDraftName] = useState(optionName)

  useEffect(() => {
    setDraftName(optionName)
  }, [optionName, props.option.id])

  const commitName = () => {
    const nextName = draftName.trim()
    if (!nextName) {
      setDraftName(optionName)
      return
    }

    if (nextName === optionName) {
      setDraftName(nextName)
      return
    }

    const updated = editor.fields.options.update(props.fieldId, props.option.id, {
      name: nextName
    })
    if (updated === undefined) {
      setDraftName(optionName)
      return
    }

    setDraftName(nextName)
  }

  const moveStatusOption = (category: StatusCategory) => {
    if (field?.kind !== 'status' || !statusCategory) {
      return
    }

    if (category === statusCategory) {
      return
    }

    editor.fields.options.reorder(
      props.fieldId,
      buildStatusIdsAfterCategoryMove(
        getStatusSections(field),
        props.option.id,
        statusCategory,
        category
      )
    )
    editor.fields.options.update(props.fieldId, props.option.id, { category })
  }

  const colorItems = useMemo<MenuItem[]>(() => buildOptionColorItems({
    selectedColor: optionColor ?? '',
    onSelect: colorId => {
      editor.fields.options.update(props.fieldId, props.option.id, {
        color: colorId
      })
    }
  }), [
    editor.fields.options,
    optionColor,
    props.fieldId,
    props.option.id
  ])

  const actionItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = []

    if (field?.kind === 'status') {
      items.push({
        kind: 'action',
        key: 'set-default',
        label: renderMessage(meta.ui.field.status.setDefault),
        leading: <Flag className="size-4" size={16} strokeWidth={1.8} />,
        trailing: isDefaultStatusOption
          ? <Check className="size-4 text-foreground" size={16} strokeWidth={1.8} />
          : undefined,
        closeOnSelect: false,
        onSelect: () => {
          editor.fields.update(props.fieldId, {
            defaultOptionId: props.option.id
          } as Partial<Omit<StatusField, 'id'>>)
        }
      })

      if (statusCategory) {
        items.push(buildChoiceSubmenuItem({
          key: 'status-group',
          label: renderMessage(meta.ui.field.status.group),
          leading: <Settings2 className="size-4" size={16} strokeWidth={1.8} />,
          suffix: getStatusCategoryLabel(statusCategory),
          value: statusCategory,
          options: (['todo', 'in_progress', 'complete'] as const).map(category => ({
            id: category,
            label: getStatusCategoryLabel(category)
          })),
          onSelect: category => {
            moveStatusOption(category)
          },
          ...FIELD_DROPDOWN_MENU_PROPS
        }))
      }
    }

    items.unshift({
      kind: 'action',
      key: 'delete-option',
      label: renderMessage(meta.ui.field.options.remove),
      leading: <Trash2 className="size-4" size={16} strokeWidth={1.8} />,
      tone: 'destructive',
      onSelect: () => {
        editor.fields.options.remove(props.fieldId, props.option.id)
        props.onDeleted?.()
        props.onRequestClose?.()
      }
    })

    return items
  }, [
    editor.fields,
    field?.kind,
    isDefaultStatusOption,
    props.fieldId,
    props.onDeleted,
    props.onRequestClose,
    props.option.id,
    statusCategory
  ])

  return (
    <div className="flex flex-col gap-1.5">
      <Input
        value={draftName}
        onChange={event => setDraftName(event.target.value)}
        onBlur={commitName}
        autoFocus
        onKeyDown={event => {
          event.stopPropagation()

          if (event.key !== 'Enter') {
            return
          }

          event.preventDefault()
          commitName()
        }}
        placeholder={renderMessage(meta.ui.field.options.namePlaceholder)}
      />

      <Menu
        className='mt-1.5'
        items={[...actionItems, ...colorItems]}
        onClose={props.onRequestClose}
        autoFocus={false}
        submenuOpenPolicy="click"
      />
    </div>
  )
}
