import { Check } from 'lucide-react'
import { useState } from 'react'
import type { Field, FieldId } from '@dataview/core/contracts'
import { Button } from '@ui/button'
import { Input } from '@ui/input'
import { meta, renderMessage, type MessageSpec } from '@dataview/meta'

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
        <div className="flex flex-col gap-0.5">
          {visibleFields.length ? (
            visibleFields.map(field => {
              const active = field.id === props.selectedFieldId
              const kind = meta.field.kind.get(field.kind)
              const Icon = kind.Icon

              return (
                <Button
                  key={field.id}
                  layout="row"
                  leading={<Icon className="size-4" size={16} strokeWidth={1.8} />}
                  suffix={renderMessage(kind.message)}
                  trailing={active
                    ? <Check className="size-4 shrink-0 text-foreground" size={16} strokeWidth={1.8} />
                    : undefined}
                  onClick={() => props.onSelect(field.id)}
                  pressed={active}
                >
                  {field.name}
                </Button>
              )
            })
          ) : (
            <div className="px-1.5 py-2 text-[12px] text-muted-foreground">
              {renderMessage(emptyMessage)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
