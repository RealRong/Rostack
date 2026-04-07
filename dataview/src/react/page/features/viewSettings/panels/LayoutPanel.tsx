import type { ViewType } from '@dataview/core/contracts'
import { useCurrentView, useDataView } from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'
import { usesOptionGroupingColors } from '@dataview/react/views/shared/optionGrouping'
import { Switch } from '@ui/switch'
import { cn } from '@ui/utils'

const SUPPORTED_LAYOUT_TYPES = ['table', 'kanban', 'gallery'] as const satisfies readonly ViewType[]

const LayoutTypeCard = (props: {
  type: (typeof SUPPORTED_LAYOUT_TYPES)[number]
  selected: boolean
  onClick: () => void
}) => {
  const descriptor = meta.view.get(props.type)
  const Icon = descriptor.Icon

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border bg-surface px-3 text-center text-fg-muted transition-colors',
        props.selected
          ? 'border-primary text-accent'
          : 'hover:bg-hover hover:text-fg'
      )}
    >
      <Icon className="size-5 shrink-0" size={18} strokeWidth={1.8} />
      <span className="truncate text-xs font-medium">
        {renderMessage(meta.ui.viewSettings.layoutPanel.viewTypeOption(props.type))}
      </span>
    </button>
  )
}

const LayoutSwitchRow = (props: {
  label: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) => (
  <div className="flex items-start gap-3">
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-foreground">
        {props.label}
      </div>
    </div>
    <Switch
      checked={props.checked}
      onCheckedChange={props.onCheckedChange}
      disabled={props.disabled}
      aria-label={props.label}
      className="mt-0.5"
    />
  </div>
)

export const LayoutPanel = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const currentView = useCurrentView()
  const view = currentView?.view
  const viewApi = view
    ? engine.view(view.id)
    : undefined
  const groupField = view?.query.group?.field
    ? currentView?.schema.fields.get(view.query.group.field)
    : undefined
  const canFillKanbanColumns = usesOptionGroupingColors(groupField)

  if (!view || !viewApi) {
    return <div className="min-h-0 flex-1 overflow-y-auto" />
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="grid grid-cols-3 gap-2">
        {SUPPORTED_LAYOUT_TYPES.map(type => (
          <LayoutTypeCard
            key={type}
            type={type}
            selected={view.type === type}
            onClick={() => {
              if (view.type === type) {
                return
              }

              viewApi.setType(type)
            }}
          />
        ))}
      </div>

      {view.type === 'table' ? (
        <div className="mt-3">
          <LayoutSwitchRow
            label={renderMessage(meta.ui.viewSettings.layoutPanel.showVerticalLines)}
            checked={view.options.table.showVerticalLines}
            onCheckedChange={checked => {
              viewApi.settings.table.setShowVerticalLines(checked)
            }}
          />
        </div>
      ) : null}

      {view.type === 'kanban' ? (
        <div className="mt-3">
          <LayoutSwitchRow
            label={renderMessage(meta.ui.viewSettings.layoutPanel.fillColumnColor)}
            checked={view.options.kanban.fillColumnColor}
            disabled={!canFillKanbanColumns}
            onCheckedChange={checked => {
              viewApi.settings.kanban.setFillColumnColor(checked)
            }}
          />
        </div>
      ) : null}
    </div>
  )
}
