import type {
  CustomField
} from '@dataview/core/contracts'
import {
  useDataView
} from '@dataview/react/dataview'
import type {
  ViewFieldRef
} from '@dataview/engine'
import { meta } from '@dataview/meta'
import { token } from '@shared/i18n'
import { useTranslation } from '@shared/i18n/react'
import { cn } from '@shared/ui/utils'
import { openCardField } from '@dataview/react/views/shared/openCardField'

export interface AddCardFieldTriggerProps {
  field: ViewFieldRef
  customField: CustomField
  className?: string
  openOnClick?: boolean
}

export const AddCardFieldTrigger = (props: AddCardFieldTriggerProps) => {
  const { t } = useTranslation()
  const dataView = useDataView()

  const kind = meta.field.kind.get(props.customField.kind)
  const Icon = kind.Icon
  const label = props.customField.name.trim() || t(kind.defaultName)

  return (
    <button
      type="button"
      className={cn(
        'group/empty-field inline-flex min-w-0 items-center gap-2 rounded-md px-0.5 py-0.5 text-left text-muted-foreground transition-colors hover:text-foreground',
        props.className
      )}
      onClick={event => {
        event.stopPropagation()
        if (!props.openOnClick) {
          dataView.selection.command.ids.replace([props.field.itemId])
        }
        openCardField({
          valueEditor: dataView.valueEditor,
          field: props.field,
          element: event.currentTarget,
          focusOwner: () => {
            dataView.selection.command.ids.replace([props.field.itemId])
          }
        })
      }}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/empty-field:text-foreground" size={16} strokeWidth={1.8} />
      <span className="min-w-0 truncate text-[13px] font-medium">
        {t(token('dataview.react.card.addField', 'Add {{label}}', {
          label
        }))}
      </span>
    </button>
  )
}
