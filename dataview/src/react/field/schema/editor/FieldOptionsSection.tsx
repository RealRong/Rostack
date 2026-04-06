import { Plus, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {
  CustomField,
  FieldOption
} from '@dataview/core/contracts'
import { getFieldOptions } from '@dataview/core/field'
import { useDataView } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import {
  OptionEditorPopover,
  FieldOptionTag
} from '@dataview/react/field/options'
import { Button } from '@ui/button'
import { FieldStatusOptionsSection } from './FieldStatusOptionsSection'

const PlainFieldOptionsSection = (props: {
  property: CustomField
}) => {
  const editor = useDataView().engine
  const [editingOptionId, setEditingOptionId] = useState<string>()
  const options = getFieldOptions(props.property)

  useEffect(() => {
    if (editingOptionId && !options.some(option => option.id === editingOptionId)) {
      setEditingOptionId(undefined)
    }
  }, [editingOptionId, options])

  const updateOption = (
    option: FieldOption,
    patch: Partial<FieldOption>
  ) => editor.fields.options.update(props.property.id, option.id, {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.color !== undefined ? { color: patch.color ?? '' } : {}),
    ...('category' in patch && patch.category !== undefined ? { category: patch.category } : {})
  })

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center justify-between gap-3">
        <div className="px-1.5 text-[11px] font-medium text-muted-foreground">
          {renderMessage(meta.ui.field.options.title)}
        </div>
      </div>

      {options.length ? (
        <div className="flex flex-col gap-0.5">
          {options.map(option => {
            const open = editingOptionId === option.id

            return (
              <OptionEditorPopover
                key={option.id}
                option={{
                  ...option,
                  color: option.color ?? undefined
                }}
                open={open}
                onOpenChange={nextOpen => setEditingOptionId(nextOpen ? option.id : undefined)}
                onRename={name => updateOption(option, { name }) !== undefined}
                onColorChange={color => {
                  updateOption(option, { color })
                }}
                onDelete={() => {
                  editor.fields.options.remove(props.property.id, option.id)
                }}
                trigger={(
                  <Button
                    layout="row"
                    pressed={open}
                    leading={<Settings2 className="size-4 shrink-0 text-muted-foreground" size={16} strokeWidth={1.8} />}
                    onClick={() => undefined}
                  >
                    <div className="min-w-0">
                      <FieldOptionTag
                        label={option.name.trim() || renderMessage(meta.ui.field.options.untitled)}
                        color={option.color ?? undefined}
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
          const option = editor.fields.options.append(props.property.id)
          if (option) {
            setEditingOptionId(option.id)
          }
        }}
        className="w-full"
      >
        {renderMessage(meta.ui.field.options.add)}
      </Button>
    </div>
  )
}

export const FieldOptionsSection = (props: {
  property: CustomField
}) => props.property.kind === 'status'
  ? <FieldStatusOptionsSection property={props.property} />
  : <PlainFieldOptionsSection property={props.property} />
