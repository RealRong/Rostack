import { Plus, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CustomField } from '@dataview/core/contracts'
import { getFieldOptions } from '@dataview/core/field'
import { useDataView } from '#react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import {
  OptionEditorPanel,
} from '#react/field/options'
import { buildOptionPanelItem } from '#react/menu-builders'
import { FIELD_DROPDOWN_MENU_PROPS } from '#react/field/dropdown'
import { Button } from '@shared/ui/button'
import { Menu, type MenuItem } from '@shared/ui/menu'
import { FieldStatusOptionsSection } from '#react/field/schema/editor/FieldStatusOptionsSection'

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
  const optionItems: readonly MenuItem[] = options.map(option => buildOptionPanelItem({
    option,
    surface: 'panel',
    size: 'md',
    ...FIELD_DROPDOWN_MENU_PROPS,
    leading: <Settings2 className="size-4 shrink-0 text-muted-foreground" size={16} strokeWidth={1.8} />,
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
