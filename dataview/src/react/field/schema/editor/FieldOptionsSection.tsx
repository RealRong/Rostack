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
  OptionEditorPanel,
  FieldOptionTag
} from '@dataview/react/field/options'
import { Button } from '@ui/button'
import { Menu, type MenuItem } from '@ui/menu'
import { FieldStatusOptionsSection } from './FieldStatusOptionsSection'

const PlainFieldOptionsSection = (props: {
  field: CustomField
}) => {
  const editor = useDataView().engine
  const [openOptionId, setOpenOptionId] = useState<string | null>(null)
  const options = getFieldOptions(props.field)

  useEffect(() => {
    if (openOptionId && !options.some(option => option.id === openOptionId)) {
      setOpenOptionId(null)
    }
  }, [openOptionId, options])
  const optionItems: readonly MenuItem[] = options.map(option => ({
    kind: 'submenu' as const,
    key: option.id,
    surface: 'panel' as const,
    size: 'md' as const,
    leading: <Settings2 className="size-4 shrink-0 text-muted-foreground" size={16} strokeWidth={1.8} />,
    label: (
      <FieldOptionTag
        label={option.name.trim() || renderMessage(meta.ui.field.options.untitled)}
        color={option.color ?? undefined}
        className="max-w-full"
      />
    ),
    content: () => (
      <OptionEditorPanel
        fieldId={props.field.id}
        option={{
          ...option,
          color: option.color ?? undefined
        }}
        onRequestClose={() => setOpenOptionId(null)}
      />
    )
  }))

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex items-center justify-between gap-3">
        <div className="px-1.5 text-[11px] font-medium text-muted-foreground">
          {renderMessage(meta.ui.field.options.title)}
        </div>
      </div>

      {options.length ? (
        <Menu
          items={optionItems}
          autoFocus={false}
          submenuOpenPolicy="click"
          openSubmenuKey={openOptionId}
          onOpenSubmenuChange={setOpenOptionId}
        />
      ) : null}

      <Button
        leading={<Plus className="size-4" size={14} strokeWidth={1.8} />}
        onClick={() => {
          const option = editor.fields.options.append(props.field.id)
          if (option) {
            setOpenOptionId(option.id)
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
  field: CustomField
}) => props.field.kind === 'status'
  ? <FieldStatusOptionsSection field={props.field} />
  : <PlainFieldOptionsSection field={props.field} />
