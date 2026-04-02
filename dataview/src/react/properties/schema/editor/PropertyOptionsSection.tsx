import { Plus, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  GroupProperty,
  GroupPropertyOption
} from '@/core/contracts'
import { getPropertyOptions } from '@/core/property'
import { useEngine } from '@/react/editor'
import { meta, renderMessage } from '@/meta'
import {
  OptionEditorPopover,
  PropertyOptionTag
} from '@/react/properties/options'
import { Button } from '@/react/ui'
import { PropertyStatusOptionsSection } from './PropertyStatusOptionsSection'

const PlainPropertyOptionsSection = (props: {
  property: GroupProperty
}) => {
  const editor = useEngine()
  const [editingOptionId, setEditingOptionId] = useState<string>()
  const options = getPropertyOptions(props.property)

  useEffect(() => {
    if (editingOptionId && !options.some(option => option.id === editingOptionId)) {
      setEditingOptionId(undefined)
    }
  }, [editingOptionId, options])

  const updateOption = (
    option: GroupPropertyOption,
    patch: Partial<GroupPropertyOption>
  ) => editor.properties.options.update(props.property.id, option.id, patch)

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center justify-between gap-3">
        <div className="px-1.5 text-[11px] font-medium text-muted-foreground">
          {renderMessage(meta.ui.property.options.title)}
        </div>
      </div>

      {options.length ? (
        <div className="flex flex-col gap-0.5">
          {options.map(option => {
            const open = editingOptionId === option.id

            return (
              <OptionEditorPopover
                key={option.id}
                option={option}
                open={open}
                onOpenChange={nextOpen => setEditingOptionId(nextOpen ? option.id : undefined)}
                onRename={name => updateOption(option, { name }) !== undefined}
                onColorChange={color => {
                  updateOption(option, { color })
                }}
                onDelete={() => {
                  editor.properties.options.remove(props.property.id, option.id)
                }}
                trigger={(
                  <Button
                    layout="row"
                    pressed={open}
                    leading={<Settings2 className="size-4 shrink-0 text-muted-foreground" size={16} strokeWidth={1.8} />}
                    onClick={() => undefined}
                  >
                    <div className="min-w-0">
                      <PropertyOptionTag
                        label={option.name.trim() || renderMessage(meta.ui.property.options.untitled)}
                        color={option.color}
                      />
                    </div>
                  </Button>
                )}
              />
            )
          })}
        </div>
      ) : null}

      <Button
        leading={<Plus className="size-4" size={14} strokeWidth={1.8} />}
        onClick={() => {
          const option = editor.properties.options.append(props.property.id)
          if (option) {
            setEditingOptionId(option.id)
          }
        }}
        className="w-full"
      >
        {renderMessage(meta.ui.property.options.add)}
      </Button>
    </div>
  )
}

export const PropertyOptionsSection = (props: {
  property: GroupProperty
}) => props.property.kind === 'status'
  ? <PropertyStatusOptionsSection property={props.property} />
  : <PlainPropertyOptionsSection property={props.property} />
