import { useMemo, useState } from 'react'
import type { Field, FieldId } from '@dataview/core/contracts'
import { Input } from '@ui/input'
import { Menu, type MenuItem } from '@ui/menu'
import { meta, renderMessage, type MessageSpec } from '@dataview/meta'
import { buildFieldToggleItem } from '@dataview/react/menu-builders'

export interface FieldPickerProps {
  fields: readonly Field[]
  selectedFieldId?: FieldId
  emptyMessage?: MessageSpec
  onSelect: (fieldId: FieldId) => void
}

export const FieldPicker = (props: FieldPickerProps) => {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const visibleFields = props.fields.filter(field => (
    !normalizedQuery || field.name.toLowerCase().includes(normalizedQuery)
  ))
  const items = useMemo<readonly MenuItem[]>(() => visibleFields.map(field => {
    const kind = meta.field.kind.get(field.kind)

    return buildFieldToggleItem(field, {
      suffix: renderMessage(kind.message),
      checked: field.id === props.selectedFieldId,
      onSelect: () => props.onSelect(field.id)
    })
  }), [props.onSelect, props.selectedFieldId, visibleFields])
  const emptyMessage = normalizedQuery
    ? meta.ui.fieldPicker.empty
    : (props.emptyMessage ?? meta.ui.fieldPicker.empty)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2.5 pb-1 pt-2.5">
        <Input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder={renderMessage(meta.ui.fieldPicker.searchPlaceholder)}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {items.length ? (
          <Menu
            items={items}
            autoFocus={false}
          />
        ) : (
          <div className="px-1.5 py-2 text-[12px] text-muted-foreground">
            {renderMessage(emptyMessage)}
          </div>
        )}
      </div>
    </div>
  )
}
