import { Check } from 'lucide-react'
import { useState } from 'react'
import type { PropertyId, GroupProperty } from '@/core/contracts'
import { meta, renderMessage, type MessageSpec } from '@/meta'
import { Button, Input } from '@/react/ui'

export interface PropertyPickerProps {
  properties: readonly GroupProperty[]
  selectedPropertyId?: PropertyId
  emptyMessage?: MessageSpec
  onSelect: (propertyId: PropertyId) => void
}

export const PropertyPicker = (props: PropertyPickerProps) => {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const visibleProperties = props.properties.filter(property => (
    !normalizedQuery || property.name.toLowerCase().includes(normalizedQuery)
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
          {visibleProperties.length ? (
            visibleProperties.map(property => {
              const active = property.id === props.selectedPropertyId
              const kind = meta.property.kind.get(property.kind)
              const Icon = kind.Icon

              return (
                <Button
                  key={property.id}
                  layout="row"
                  leading={<Icon className="size-4" size={16} strokeWidth={1.8} />}
                  suffix={renderMessage(kind.message)}
                  trailing={active
                    ? <Check className="size-4 shrink-0 text-foreground" size={16} strokeWidth={1.8} />
                    : undefined}
                  onClick={() => props.onSelect(property.id)}
                  pressed={active}
                >
                  {property.name}
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
