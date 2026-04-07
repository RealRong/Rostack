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
import {
  resolveOptionDotStyle,
  resolveOptionColorToken
} from '@ui/color'
import { Input } from '@ui/input'
import { Menu, type MenuItem } from '@ui/menu'
import {
  useDataView,
  useFieldById
} from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import type { OptionLike } from './OptionEditorPopover'
import { buildStatusIdsAfterCategoryMove } from './statusOptionMenu'

export interface OptionEditorPanelProps {
  fieldId: string
  option: OptionLike
  onDeleted?: () => void
  onRequestClose?: () => void
}

export const OptionEditorPanel = (props: OptionEditorPanelProps) => {
  const editor = useDataView().engine
  const field = useFieldById(props.fieldId)
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

  const colorItems = useMemo<MenuItem[]>(() => [
    {
      kind: 'label',
      key: 'color-label',
      label: renderMessage(meta.ui.field.options.color)
    },
    ...meta.option.color.list.map(color => {
      const active = (optionColor ?? '') === color.id

      return {
        kind: 'action' as const,
        key: `color-${color.id || 'default'}`,
        label: renderMessage(color.message),
        leading: (
          <span
            className="inline-flex h-3 w-3 shrink-0 rounded-full border"
            style={{
              ...resolveOptionDotStyle(color.id),
              borderColor: resolveOptionColorToken(color.id, 'badge-border')
            }}
          />
        ),
        trailing: active
          ? <Check className="size-4 text-foreground" size={16} strokeWidth={1.8} />
          : undefined,
        closeOnSelect: false,
        onSelect: () => {
          editor.fields.options.update(props.fieldId, props.option.id, {
            color: color.id
          })
        }
      }
    })
  ], [
    editor.fields.options,
    optionColor,
    props.fieldId,
    props.option.id
  ])

  const groupItems = useMemo<MenuItem[]>(() => {
    if (field?.kind !== 'status' || !statusCategory) {
      return []
    }

    return ([
      ...(['todo', 'in_progress', 'complete'] as const).map(category => ({
        kind: 'toggle' as const,
        key: `status-group-${category}`,
        label: getStatusCategoryLabel(category),
        checked: statusCategory === category,
        onSelect: () => {
          moveStatusOption(category)
        }
      }))
    ])
  }, [
    field?.kind,
    statusCategory
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
        items.push({
          kind: 'submenu',
          key: 'status-group',
          label: renderMessage(meta.ui.field.status.group),
          leading: <Settings2 className="size-4" size={16} strokeWidth={1.8} />,
          suffix: getStatusCategoryLabel(statusCategory),
          items: groupItems,
          presentation: 'dropdown'
        })
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
    groupItems,
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
