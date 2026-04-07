import { Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  resolveOptionDotStyle,
  resolveOptionColorToken
} from '@ui/color'
import { Input } from '@ui/input'
import { Menu, type MenuItem } from '@ui/menu'
import { meta, renderMessage } from '@dataview/meta'
import type { OptionLike } from './OptionEditorPopover'

export interface OptionEditorPanelProps {
  option: OptionLike
  onRename: (name: string) => boolean | void
  onColorChange: (color: string) => void
  onDelete?: () => void
  onRequestClose?: () => void
  extraItems?: readonly MenuItem[]
}

export const OptionEditorPanel = (props: OptionEditorPanelProps) => {
  const [draftName, setDraftName] = useState(props.option.name)

  useEffect(() => {
    setDraftName(props.option.name)
  }, [props.option.id, props.option.name])

  const commitName = () => {
    const nextName = draftName.trim()
    if (!nextName) {
      setDraftName(props.option.name)
      return
    }

    if (nextName === props.option.name) {
      setDraftName(nextName)
      return
    }

    const result = props.onRename(nextName)
    if (result === false) {
      setDraftName(props.option.name)
      return
    }

    setDraftName(nextName)
  }

  const items = useMemo<MenuItem[]>(() => {
    const colorItems: MenuItem[] = [
      {
        kind: 'label',
        key: 'color-label',
        label: renderMessage(meta.ui.field.options.color)
      },
      ...meta.option.color.list.map(color => {
        const active = (props.option.color ?? '') === color.id

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
            props.onColorChange(color.id)
          }
        }
      })
    ]

    const nextItems: MenuItem[] = [...colorItems]

    if (props.extraItems?.length) {
      nextItems.push({
        kind: 'divider',
        key: 'extra-divider'
      })
      nextItems.push(...props.extraItems)
    }

    if (props.onDelete) {
      nextItems.push({
        kind: 'divider',
        key: 'delete-divider'
      })
      nextItems.push({
        kind: 'action',
        key: 'delete-option',
        label: renderMessage(meta.ui.field.options.remove),
        tone: 'destructive',
        onSelect: () => {
          props.onDelete?.()
          props.onRequestClose?.()
        }
      })
    }

    return nextItems
  }, [props.extraItems, props.onColorChange, props.onDelete, props.onRequestClose, props.option.color])

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={draftName}
        onChange={event => setDraftName(event.target.value)}
        onBlur={commitName}
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
        items={items}
        onClose={props.onRequestClose}
        autoFocus={false}
        submenuOpenPolicy="click"
      />
    </div>
  )
}
