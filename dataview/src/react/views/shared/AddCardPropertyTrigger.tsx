import type {
  GroupProperty,
  PropertyId
} from '@dataview/core/contracts'
import {
  useCurrentView,
  useDataView
} from '@dataview/react/dataview'
import type {
  ViewFieldRef
} from '@dataview/engine/projection/view'
import {
  meta,
  renderMessage
} from '@dataview/meta'
import { cn } from '@ui/utils'
import { openCardField } from './openCardField'

export interface AddCardPropertyTriggerProps {
  field: ViewFieldRef
  property: GroupProperty
  fieldPropertyIds: readonly PropertyId[]
  className?: string
  onSelect?: () => void
}

export const AddCardPropertyTrigger = (props: AddCardPropertyTriggerProps) => {
  const dataView = useDataView()
  const currentView = useCurrentView(view => (
    view?.view.id === props.field.viewId
      ? view
      : undefined
  ))
  if (!currentView) {
    throw new Error('Add card property trigger requires an active current view.')
  }

  const kind = meta.property.kind.get(props.property.kind)
  const Icon = kind.Icon
  const label = props.property.name.trim() || renderMessage(kind.defaultName)

  return (
    <button
      type="button"
      className={cn(
        'group/empty-field inline-flex min-w-0 items-center gap-2 rounded-md px-0.5 py-0.5 text-left text-muted-foreground transition-colors hover:text-foreground',
        props.className
      )}
      onClick={event => {
        event.stopPropagation()
        props.onSelect?.()
        openCardField({
          valueEditor: dataView.valueEditor,
          currentView,
          field: props.field,
          fieldPropertyIds: props.fieldPropertyIds,
          element: event.currentTarget
        })
      }}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/empty-field:text-foreground" size={16} strokeWidth={1.8} />
      <span className="min-w-0 truncate text-[13px] font-medium">
        {`添加 ${label}`}
      </span>
    </button>
  )
}
